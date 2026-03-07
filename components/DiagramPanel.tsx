'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useDiagramStore } from '@/store/diagramStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { renderMermaidDetailed } from '@/utils/renderMermaid';

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.15;

export function DiagramPanel() {
  const mermaidSource = useDiagramStore((s) => s.mermaidSource);
  const [exporting, setExporting] = useState(false);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Zoom/Pan state
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const translateStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Render mermaid + reset view in a single effect to avoid race conditions
  useEffect(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });

    if (!mermaidSource?.trim()) {
      setSvg(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setError(null);
    renderMermaidDetailed(mermaidSource).then((result) => {
      if (cancelled) return;
      if (result.svg) {
        // Remove width="100%" so SVG uses viewBox intrinsic size inside absolute container
        const fixed = result.svg.replace(/\bwidth="100%"/, '');
        setSvg(fixed);
        setError(null);
      } else {
        console.warn('[DiagramPanel] render failed:', result.error, '\nSource:', mermaidSource.slice(0, 300));
        setError(result.error || 'Could not render diagram');
      }
    });
    return () => { cancelled = true; };
  }, [mermaidSource]);

  // Wheel zoom — zoom toward cursor position
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    setScale((prev) => {
      const direction = e.deltaY < 0 ? 1 : -1;
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev * (1 + direction * ZOOM_STEP)));
      const ratio = next / prev;

      setTranslate((t) => ({
        x: cursorX - ratio * (cursorX - t.x),
        y: cursorY - ratio * (cursorY - t.y),
      }));

      return next;
    });
  }, []);

  // Pan handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY };
    translateStart.current = { ...translate };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [translate]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning) return;
    setTranslate({
      x: translateStart.current.x + (e.clientX - panStart.current.x),
      y: translateStart.current.y + (e.clientY - panStart.current.y),
    });
  }, [isPanning]);

  const handlePointerUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const zoomIn = () => {
    setScale((s) => Math.min(MAX_SCALE, s * (1 + ZOOM_STEP)));
  };
  const zoomOut = () => {
    setScale((s) => Math.max(MIN_SCALE, s * (1 - ZOOM_STEP)));
  };
  const resetView = () => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  };
  const fitToView = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const svgEl = container.querySelector('svg');
    if (!svgEl) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const sw = svgEl.width.baseVal.value || svgEl.getBoundingClientRect().width;
    const sh = svgEl.height.baseVal.value || svgEl.getBoundingClientRect().height;
    if (!sw || !sh) return;

    const fitScale = Math.min(cw / sw, ch / sh, 1) * 0.9;
    const tx = (cw - sw * fitScale) / 2;
    const ty = (ch - sh * fitScale) / 2;
    setScale(fitScale);
    setTranslate({ x: tx, y: ty });
  }, []);

  const handleExport = async () => {
    const mermaidSourceForExport = useDiagramStore.getState().mermaidSource;
    const relatedPaths = useDiagramStore.getState().relatedPaths;
    const workspacePath = useWorkspaceStore.getState().path;
    if (!mermaidSourceForExport?.trim()) return;
    setExporting(true);
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diagramMermaid: mermaidSourceForExport,
          workspacePath: workspacePath ?? undefined,
          relatedPaths: relatedPaths ?? undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        console.error(data.error);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `canton-export-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  const scalePercent = Math.round(scale * 100);

  const [showSource, setShowSource] = useState(false);

  const content = svg ? (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 min-w-0 w-full overflow-hidden relative"
      style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        style={{
          position: 'absolute',
          width: '100%',
          transformOrigin: 'top left',
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          willChange: 'transform',
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  ) : error ? (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4 text-center">
      <div className="text-[#ff6b6b] text-sm">{error}</div>
      {mermaidSource && (
        <button
          onClick={() => setShowSource((v) => !v)}
          className="text-xs text-[#666666] hover:text-[#a0a0a0] underline"
        >
          {showSource ? 'Hide source' : 'Show mermaid source'}
        </button>
      )}
      {showSource && mermaidSource && (
        <pre className="text-[10px] text-[#666666] bg-[#141414] border border-[#2a2a2a] rounded p-2 max-h-60 overflow-auto w-full text-left whitespace-pre-wrap">
          {mermaidSource}
        </pre>
      )}
    </div>
  ) : (
    <div className="flex-1 flex items-center justify-center text-[#666666] text-sm">
      Diagram will appear here
    </div>
  );

  return (
    <div className="h-full w-full min-w-0 flex flex-col bg-[#0a0a0a]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#2a2a2a] bg-[#141414]">
        <span className="text-sm text-[#a0a0a0]">Architecture diagram</span>
        <div className="flex items-center gap-1">
          {svg && (
            <>
              <button
                onClick={zoomOut}
                className="w-7 h-7 flex items-center justify-center rounded text-[#a0a0a0] hover:bg-[#2a2a2a] hover:text-white transition-colors text-base"
                title="Zoom out"
              >
                −
              </button>
              <span className="text-[10px] text-[#666666] w-10 text-center tabular-nums">{scalePercent}%</span>
              <button
                onClick={zoomIn}
                className="w-7 h-7 flex items-center justify-center rounded text-[#a0a0a0] hover:bg-[#2a2a2a] hover:text-white transition-colors text-base"
                title="Zoom in"
              >
                +
              </button>
              <button
                onClick={fitToView}
                className="w-7 h-7 flex items-center justify-center rounded text-[#a0a0a0] hover:bg-[#2a2a2a] hover:text-white transition-colors text-xs"
                title="Fit to view"
              >
                ⊞
              </button>
              <button
                onClick={resetView}
                className="w-7 h-7 flex items-center justify-center rounded text-[#a0a0a0] hover:bg-[#2a2a2a] hover:text-white transition-colors text-xs"
                title="Reset (100%)"
              >
                1:1
              </button>
              <div className="w-px h-4 bg-[#2a2a2a] mx-1" />
            </>
          )}
          <button
            onClick={handleExport}
            disabled={!mermaidSource?.trim() || exporting}
            className="text-xs px-3 py-1.5 rounded-lg bg-[#f3ff97] text-black font-medium hover:bg-[#e5f080] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {exporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>
      {content}
    </div>
  );
}
