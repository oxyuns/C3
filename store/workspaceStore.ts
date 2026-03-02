import { create } from 'zustand';

interface WorkspaceState {
  path: string | null;
  setPath: (path: string | null) => void;
  initDefault: () => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  path: null,
  setPath: (path) => set({ path }),
  initDefault: async () => {
    try {
      const res = await fetch('/api/workspace/default');
      const data = await res.json();
      if (data.path) set({ path: data.path });
    } catch (err) {
      console.error('Failed to init default workspace:', err);
    }
  },
}));
