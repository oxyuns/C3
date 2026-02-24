import { create } from 'zustand';

interface DiagramState {
  mermaidSource: string | null;
  relatedPaths: string[] | null;
  setMermaidSource: (source: string | null) => void;
  setDiagram: (mermaid: string | null, relatedPaths?: string[] | null) => void;
}

export const useDiagramStore = create<DiagramState>((set) => ({
  mermaidSource: null,
  relatedPaths: null,
  setMermaidSource: (source) => set({ mermaidSource: source, relatedPaths: null }),
  setDiagram: (mermaid, relatedPaths) =>
    set({ mermaidSource: mermaid, relatedPaths: relatedPaths ?? null }),
}));
