import type { FormField } from './store/chatStore';

declare global {
  interface Window {
    electronAPI?: {
      workspace: {
        getDefault: () => Promise<{ path: string }>;
        open: () => Promise<{ path: string } | null>;
      };
      agent: {
        chat: (p: {
          workspacePath: string;
          messages: { role: string; content: string }[];
        }) => Promise<{
          content?: string;
          error?: string;
          suggestedOptions?: { id: string; label: string; payload?: string }[];
          formFields?: FormField[];
        }>;
      };
      onAgentContentDelta?: (cb: (content: string) => void) => void;
      onDiagramMermaidSource?: (cb: (payload: string | { mermaid: string; relatedPaths?: string[] | null }) => void) => void;
      export: {
        workspace: (diagramMermaid: string, workspacePath?: string | null, relatedPaths?: string[] | null) =>
          Promise<{ ok?: boolean; path?: string; error?: string } | null>;
      };
    };
  }
}

export {};
