'use client';

import { useEffect, useState } from 'react';
import { useDiagramStore } from '@/store/diagramStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { renderMermaidToSvg } from '@/utils/renderMermaid';

export function DiagramPanel() {
  const mermaidSource = useDiagramStore((s) => s.mermaidSource);
  const [exporting, setExporting] = useState(false);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mermaidSource?.trim()) {
      setSvg(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setError(null);
    renderMermaidToSvg(mermaidSource).then((result) => {
      if (!cancelled) {
        if (result) {
          setSvg(result);
        } else {
          setError('Could not render diagram');
        }
      }
    });
    return () => { cancelled = true; };
  }, [mermaidSource]);

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

  const content = svg ? (
    <div
      className="flex-1 overflow-auto p-4 flex items-center justify-center [&_svg]:max-w-full [&_svg]:h-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  ) : error ? (
    <div className="flex-1 flex items-center justify-center text-[#a0a0a0] text-sm">
      {error}
    </div>
  ) : (
    <div className="flex-1 flex items-center justify-center text-[#666666] text-sm">
      Diagram will appear here
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#2a2a2a] bg-[#141414]">
        <span className="text-sm text-[#a0a0a0]">Architecture diagram</span>
        <button
          onClick={handleExport}
          disabled={!mermaidSource?.trim() || exporting}
          className="text-xs px-3 py-1.5 rounded-lg bg-[#f3ff97] text-black font-medium hover:bg-[#e5f080] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {exporting ? 'Exporting...' : 'Export'}
        </button>
      </div>
      {content}
    </div>
  );
}
