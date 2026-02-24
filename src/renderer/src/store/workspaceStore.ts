import { create } from 'zustand';

interface WorkspaceState {
  path: string | null;
  setPath: (path: string | null) => void;
  initDefault: () => Promise<void>;
  openWorkspace: () => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  path: null,
  setPath: (path) => set({ path }),
  initDefault: async () => {
    const result = await window.electronAPI?.workspace.getDefault();
    if (result?.path) {
      set({ path: result.path });
    }
  },
  openWorkspace: async () => {
    const result = await window.electronAPI?.workspace.open();
    if (result?.path) {
      set({ path: result.path });
    }
  },
}));
