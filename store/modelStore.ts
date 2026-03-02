import { create } from 'zustand';

export interface ModelInfo {
  id: string;
  provider: string;
  label: string;
  available: boolean;
}

interface ModelState {
  models: ModelInfo[];
  selectedModelId: string;
  setSelectedModelId: (id: string) => void;
  fetchModels: () => Promise<void>;
}

export const useModelStore = create<ModelState>((set) => ({
  models: [],
  selectedModelId: 'gpt-4o',
  setSelectedModelId: (id) => set({ selectedModelId: id }),
  fetchModels: async () => {
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      if (data.models) {
        set({ models: data.models });
        // Auto-select first available model if current isn't available
        const current = data.models.find((m: ModelInfo) => m.id === useModelStore.getState().selectedModelId);
        if (!current?.available) {
          const first = data.models.find((m: ModelInfo) => m.available);
          if (first) set({ selectedModelId: first.id });
        }
      }
    } catch (err) {
      console.error('Failed to fetch models:', err);
    }
  },
}));
