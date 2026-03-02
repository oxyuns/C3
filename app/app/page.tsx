'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ResizableSplitLayout } from '@/components/ResizableSplitLayout';
import { ChatPanel } from '@/components/ChatPanel';
import { DiagramPanel } from '@/components/DiagramPanel';
import { Header } from '@/components/Header';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useAuth } from '@/components/Providers';

export default function AppPage() {
  const { user, loading, isAuthorized } = useAuth();
  const router = useRouter();
  const workspacePath = useWorkspaceStore((s) => s.path);
  const initDefault = useWorkspaceStore((s) => s.initDefault);

  useEffect(() => {
    if (loading) return;
    if (!user) router.push('/');
    else if (!isAuthorized) router.push('/waitlist');
  }, [user, isAuthorized, loading, router]);

  useEffect(() => {
    if (!workspacePath) {
      initDefault();
    }
  }, [workspacePath, initDefault]);

  if (loading || !user || !isAuthorized) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a0a0a] text-[#666666] text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0a] text-white font-sans antialiased">
      <Header />
      <main className="flex-1 min-h-0 overflow-hidden">
        {workspacePath ? (
          <ResizableSplitLayout
            left={<ChatPanel />}
            right={<DiagramPanel />}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-[#666666] text-sm">
            Loading workspace...
          </div>
        )}
      </main>
    </div>
  );
}
