'use client';

import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

interface ResizableSplitLayoutProps {
  left: React.ReactNode;
  right: React.ReactNode;
}

export function ResizableSplitLayout({ left, right }: ResizableSplitLayoutProps) {
  return (
    <PanelGroup direction="horizontal" className="h-full">
      <Panel defaultSize={50} minSize={25} maxSize={75}>
        <div className="h-full overflow-hidden">{left}</div>
      </Panel>
      <PanelResizeHandle className="w-1 bg-[#2a2a2a] hover:bg-[#f3ff97] transition-colors cursor-col-resize" />
      <Panel defaultSize={50} minSize={20} maxSize={75}>
        <div className="h-full overflow-hidden">{right}</div>
      </Panel>
    </PanelGroup>
  );
}
