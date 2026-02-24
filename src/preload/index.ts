import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  workspace: {
    getDefault: () => ipcRenderer.invoke('workspace:getDefault'),
    open: () => ipcRenderer.invoke('workspace:open'),
  },
  agent: {
    chat: (params: { workspacePath: string; messages: { role: string; content: string }[] }) =>
      ipcRenderer.invoke('agent:chat', params),
  },
  onAgentContentDelta: (cb: (content: string) => void) => {
    ipcRenderer.on('agent:contentDelta', (_, content: string) => cb(content));
  },
  onDiagramMermaidSource: (cb: (mermaid: string) => void) => {
    ipcRenderer.on('diagram:mermaidSource', (_, mermaid: string) => cb(mermaid));
  },
  export: {
    workspace: (diagramMermaid: string, workspacePath?: string | null, relatedPaths?: string[] | null) =>
      ipcRenderer.invoke('export:workspace', diagramMermaid, workspacePath ?? null, relatedPaths ?? null),
  },
});
