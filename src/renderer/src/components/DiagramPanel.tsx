import { useEffect, useState } from 'react';
import { useDiagramStore } from '../store/diagramStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import { renderMermaidToSvg } from '../utils/renderMermaid';

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
      const result = await window.electronAPI?.export?.workspace?.(
        mermaidSourceForExport,
        workspacePath ?? undefined,
        relatedPaths ?? undefined
      );
      if (result?.error) {
        console.error(result.error);
      }
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
    <div className="flex-1 flex items-center justify-center text-[#6b6b6b] text-sm">
      {error}
    </div>
  ) : (
    <div className="flex-1 flex items-center justify-center text-[#9ca3af] text-sm">
      Diagram will appear here
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-[#f5f5f5]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#e5e7eb] bg-white">
        <span className="text-sm text-[#6b6b6b]">Architecture diagram</span>
        <button
          onClick={handleExport}
          disabled={!mermaidSource?.trim() || exporting}
          className="text-xs px-2 py-1 rounded border border-[#d1d5db] hover:bg-[#fafafa] disabled:opacity-50"
        >
          {exporting ? 'Exporting...' : 'Export'}
        </button>
      </div>
      {content}
    </div>
  );
}
