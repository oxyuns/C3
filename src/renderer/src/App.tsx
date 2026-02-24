import { useEffect } from 'react';
import { ResizableSplitLayout } from './components/ResizableSplitLayout';
import { ChatPanel } from './components/ChatPanel';
import { DiagramPanel } from './components/DiagramPanel';
import { Header } from './components/Header';
import { useWorkspaceStore } from './store/workspaceStore';

export default function App() {
  const workspacePath = useWorkspaceStore((s) => s.path);
  const initDefault = useWorkspaceStore((s) => s.initDefault);

  useEffect(() => {
    if (!workspacePath) {
      initDefault();
    }
  }, [workspacePath, initDefault]);

  return (
    <div className="h-screen flex flex-col bg-[#ffffff] text-[#1e1e1e] font-sans antialiased">
      <Header />
      <main className="flex-1 min-h-0 overflow-hidden">
        {workspacePath ? (
          <ResizableSplitLayout
            left={<ChatPanel />}
            right={<DiagramPanel />}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-[#6b6b6b] text-sm">
            Loading workspace...
          </div>
        )}
      </main>
    </div>
  );
}

function WelcomeScreen() {
  const openWorkspace = useWorkspaceStore((s) => s.openWorkspace);

  return (
    <div className="h-full flex flex-col items-center justify-center bg-[#f5f5f5]">
      <h1 className="text-2xl font-medium text-[#1e1e1e] mb-2">
        Canton Contract Catalyst
      </h1>
      <p className="text-[#6b6b6b] mb-8 text-sm">
        Design DAML financial contracts with AI
      </p>
      <button
        onClick={openWorkspace}
        className="px-6 py-3 rounded-lg border border-[#d1d5db] bg-white text-[#1e1e1e] hover:bg-[#fafafa] transition-colors text-sm"
      >
        Open folder
      </button>
    </div>
  );
}
