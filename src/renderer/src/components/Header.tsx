import { useWorkspaceStore } from '../store/workspaceStore';

export function Header() {
  const path = useWorkspaceStore((s) => s.path);
  const openWorkspace = useWorkspaceStore((s) => s.openWorkspace);

  return (
    <header className="h-12 flex items-center justify-between pl-[78px] pr-4 border-b border-[#e5e7eb] bg-white shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-[#1e1e1e]">
          Canton Contract Catalyst
        </span>
        {path && (
          <span className="text-xs text-[#6b6b6b] truncate max-w-[300px]">
            {path}
          </span>
        )}
      </div>
      <button
        onClick={openWorkspace}
        className="text-xs text-[#6b6b6b] hover:text-[#1e1e1e] px-2 py-1 rounded"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {path ? 'Change folder' : 'Open folder'}
      </button>
    </header>
  );
}
