'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useChatStore } from '@/store/chatStore';
import { useDiagramStore } from '@/store/diagramStore';
import { useModelStore } from '@/store/modelStore';
import { extractMermaidBlocks, extractPartialMermaidBlocks } from '@/utils/renderMermaid';
import type { FormField } from '@/store/chatStore';

function GeneratingDots() {
  const [dots, setDots] = useState('');
  useEffect(() => {
    const id = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '' : d + '.'));
    }, 400);
    return () => clearInterval(id);
  }, []);
  return <span>Generating response{dots}</span>;
}

function InputFormBlock({
  fields,
  onSubmit,
}: {
  fields: FormField[];
  onSubmit: (values: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.id, f.defaultValue ?? '']))
  );

  const handleSubmit = () => {
    onSubmit(values);
  };

  return (
    <div className="ml-8 mt-2 p-4 rounded-lg border border-[#2a2a2a] bg-[#141414] max-w-md">
      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.id}>
            <label className="block text-xs text-[#a0a0a0] mb-1">
              {f.label}
              {f.optional && <span className="text-[#666666] ml-1">(optional)</span>}
            </label>
            <input
              type="text"
              value={values[f.id] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
              placeholder={f.placeholder}
              className="w-full px-3 py-2 rounded border border-[#2a2a2a] text-sm bg-[#1a1a1a] text-white placeholder-[#666666] focus:outline-none focus:border-[#f3ff97]"
            />
          </div>
        ))}
      </div>
      <button
        onClick={handleSubmit}
        className="mt-3 px-4 py-2 rounded-lg bg-[#f3ff97] text-black text-sm font-medium hover:bg-[#e5f080] transition-colors"
      >
        Submit
      </button>
    </div>
  );
}

function parseSSEEvents(buffer: string): { events: Array<{ event: string; data: string }>; remaining: string } {
  const events: Array<{ event: string; data: string }> = [];
  const parts = buffer.split('\n\n');
  const remaining = parts.pop() || '';

  for (const part of parts) {
    if (!part.trim()) continue;
    let eventType = '';
    let data = '';
    for (const line of part.split('\n')) {
      if (line.startsWith('event: ')) eventType = line.slice(7);
      else if (line.startsWith('data: ')) data = line.slice(6);
    }
    if (eventType && data) {
      events.push({ event: eventType, data });
    }
  }

  return { events, remaining };
}

export function ChatPanel() {
  const workspacePath = useWorkspaceStore((s) => s.path);
  const { messages, isLoading, error, addMessage, setLoading, setError } = useChatStore();
  const { models, selectedModelId, setSelectedModelId, fetchModels } = useModelStore();
  const [input, setInput] = useState('');
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const sendMessageWithText = async (textToSend: string) => {
    if (!textToSend.trim() || !workspacePath) return;
    addMessage({ role: 'user', content: textToSend.trim() });
    setLoading(true);
    setError(null);
    setStreamingContent(null);

    try {
      const history = [...messages, { role: 'user' as const, content: textToSend.trim() }];

      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspacePath,
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          modelId: selectedModelId,
        }),
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const { events, remaining } = parseSSEEvents(buffer);
        buffer = remaining;

        for (const { event, data } of events) {
          try {
            const parsed = JSON.parse(data);
            switch (event) {
              case 'content_delta': {
                setStreamingContent(parsed.content);
                const complete = extractMermaidBlocks(parsed.content);
                if (complete) {
                  useDiagramStore.getState().setDiagram(complete, null);
                }
                break;
              }
              case 'diagram_update': {
                useDiagramStore.getState().setDiagram(parsed.mermaid, parsed.relatedPaths ?? null);
                break;
              }
              case 'done': {
                setStreamingContent(null);
                if (
                  parsed.content !== undefined ||
                  (parsed.formFields && parsed.formFields.length > 0) ||
                  (parsed.suggestedOptions && parsed.suggestedOptions.length > 0)
                ) {
                  const assistantContent = parsed.content ?? '';
                  addMessage({
                    role: 'assistant',
                    content: assistantContent,
                    options: parsed.suggestedOptions,
                    formFields: parsed.formFields,
                  });
                  const mermaidBlock = extractMermaidBlocks(assistantContent) ?? extractPartialMermaidBlocks(assistantContent);
                  if (mermaidBlock) {
                    useDiagramStore.getState().setDiagram(mermaidBlock, null);
                  }
                }
                break;
              }
              case 'error': {
                setError(parsed.error);
                break;
              }
            }
          } catch {
            // Skip malformed SSE data
          }
        }
      }
    } catch (e) {
      setStreamingContent(null);
      setError((e as Error).message);
    } finally {
      setStreamingContent(null);
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    await sendMessageWithText(text);
  };

  const mermaidFilter = (element: { tagName: string; children?: unknown[] }) => {
    if (element.tagName === 'pre') {
      const code = element.children?.[0] as { properties?: { className?: unknown[] }; children?: { value?: string }[] } | undefined;
      const className = code?.properties?.className;
      const isMermaid = Array.isArray(className) && className.some((c) => typeof c === 'string' && c.includes('language-mermaid'));
      const textNode = code?.children?.[0] as { type?: string; value?: string } | undefined;
      const text = (textNode?.type === 'text' ? textNode?.value : '') ?? '';
      const looksLikeMermaid = /^\s*(flowchart|graph|erDiagram|sequenceDiagram|classDiagram)/m.test(text);
      if (isMermaid || looksLikeMermaid) return false;
    }
    return true;
  };

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a] min-w-0">
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 min-w-0">
        {messages.length === 0 ? (
          <div className="text-center text-[#666666] text-sm py-12">
            Enter a message
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={msg.id} className="space-y-2 min-w-0">
              <div
                className={`p-3 rounded-lg text-sm break-words ${
                  msg.role === 'user'
                    ? 'bg-[#1a1a1a] text-white ml-8'
                    : 'bg-[#141414] border border-[#2a2a2a] text-white mr-8 prose prose-sm prose-dark max-w-none prose-p:my-1 prose-ul:my-2 prose-li:my-0'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <ReactMarkdown
                    allowElement={mermaidFilter}
                    components={{}}
                  >
                    {msg.content}
                  </ReactMarkdown>
                ) : (
                  msg.content
                )}
              </div>
              {msg.options && msg.options.length > 0 && (
                <div className="flex flex-wrap gap-2 ml-8">
                  {msg.options.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        if (opt.id === 'direct_input') {
                          inputRef.current?.focus();
                        } else {
                          sendMessageWithText(opt.payload ?? opt.label);
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg border border-[#2a2a2a] bg-[#141414] text-sm text-white hover:border-[#f3ff97] hover:text-[#f3ff97] transition-colors"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
              {msg.formFields &&
                msg.formFields.length > 0 &&
                (idx >= messages.length - 1 ||
                  messages[idx + 1]?.role !== 'user') && (
                <InputFormBlock
                  key={msg.id}
                  fields={msg.formFields}
                  onSubmit={(vals) => {
                    const payload: Record<string, string> = {};
                    for (const f of msg.formFields!) {
                      payload[f.id] = (vals[f.id] ?? '').trim() || '(empty)';
                    }
                    const text = `[FORM_SUBMITTED] ${JSON.stringify(payload)}`;
                    sendMessageWithText(text);
                  }}
                />
              )}
            </div>
          ))
        )}
        {error && (
          <div className="p-3 rounded-lg text-sm bg-[#ff6b6b]/20 text-[#ff6b6b] border border-[#ff6b6b]/30">
            {error}
          </div>
        )}
        {isLoading && (
          <div className="space-y-2 min-w-0">
            {streamingContent ? (
              <div
                className="p-3 rounded-lg text-sm break-words bg-[#141414] border border-[#2a2a2a] text-white mr-8 prose prose-sm prose-dark max-w-none prose-p:my-1 prose-ul:my-2 prose-li:my-0"
              >
                <ReactMarkdown
                  allowElement={mermaidFilter}
                  components={{}}
                >
                  {streamingContent}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="p-3 rounded-lg text-sm text-[#666666] ml-8 flex items-center gap-1">
                <GeneratingDots />
              </div>
            )}
          </div>
        )}
      </div>
      <div className="p-4 border-t border-[#2a2a2a] bg-[#141414]">
        <div className="flex items-center justify-between mb-2">
          <select
            value={selectedModelId}
            onChange={(e) => setSelectedModelId(e.target.value)}
            className="text-xs px-2 py-1 rounded bg-[#1a1a1a] border border-[#2a2a2a] text-[#a0a0a0] focus:outline-none focus:border-[#f3ff97] cursor-pointer"
          >
            {models.length > 0 ? (
              models.map((m) => (
                <option key={m.id} value={m.id} disabled={!m.available}>
                  {m.label}{!m.available ? ' (no key)' : ''}
                </option>
              ))
            ) : (
              <option value={selectedModelId}>Loading...</option>
            )}
          </select>
          <span className="text-[10px] text-[#666666]">Cmd+Enter to send</span>
        </div>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              if (e.metaKey || e.ctrlKey) {
                e.preventDefault();
                sendMessage();
              }
            }
          }}
          placeholder="Enter message... (Cmd+Enter to send)"
          rows={3}
          className="w-full px-4 py-2 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] text-white placeholder-[#666666] text-sm focus:outline-none focus:border-[#f3ff97] resize-y min-h-[60px]"
        />
      </div>
    </div>
  );
}
