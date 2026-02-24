import { useState, useRef, useEffect } from 'react';

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
import ReactMarkdown from 'react-markdown';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useChatStore } from '../store/chatStore';
import { useDiagramStore } from '../store/diagramStore';
import { extractMermaidBlocks, extractPartialMermaidBlocks } from '../utils/renderMermaid';
import type { FormField } from '../store/chatStore';

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
    <div className="ml-8 mt-2 p-4 rounded-lg border border-[#e5e7eb] bg-white max-w-md">
      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.id}>
            <label className="block text-xs text-[#6b6b6b] mb-1">
              {f.label}
              {f.optional && <span className="text-[#9ca3af] ml-1">(optional)</span>}
            </label>
            <input
              type="text"
              value={values[f.id] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
              placeholder={f.placeholder}
              className="w-full px-3 py-2 rounded border border-[#e5e7eb] text-sm bg-[#fafafa] focus:outline-none focus:border-[#d1d5db]"
            />
          </div>
        ))}
      </div>
      <button
        onClick={handleSubmit}
        className="mt-3 px-4 py-2 rounded-lg border border-[#d1d5db] bg-white text-sm hover:bg-[#fafafa]"
      >
        Submit
      </button>
    </div>
  );
}

export function ChatPanel() {
  const workspacePath = useWorkspaceStore((s) => s.path);
  const { messages, isLoading, error, addMessage, setLoading, setError } = useChatStore();
  const [input, setInput] = useState('');
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const cb = (content: string) => {
      setStreamingContent(content);
      // Only use complete mermaid blocks (with closing ```) during streaming.
      // Partial blocks cause parse errors (e.g. IOU -->|transfers| + newline = incomplete arrow).
      const complete = extractMermaidBlocks(content);
      if (complete) {
        useDiagramStore.getState().setDiagram(complete, null);
      }
    };
    window.electronAPI?.onAgentContentDelta?.(cb);
  }, []);

  useEffect(() => {
    const cb = (payload: string | { mermaid: string; relatedPaths?: string[] | null }) => {
      if (typeof payload === 'string') {
        useDiagramStore.getState().setDiagram(payload, null);
      } else if (payload?.mermaid) {
        useDiagramStore.getState().setDiagram(payload.mermaid, payload.relatedPaths ?? null);
      }
    };
    window.electronAPI?.onDiagramMermaidSource?.(cb);
  }, []);

  const sendMessageWithText = async (textToSend: string) => {
    if (!textToSend.trim() || !workspacePath) return;
    addMessage({ role: 'user', content: textToSend.trim() });
    setLoading(true);
    setError(null);
    setStreamingContent(null);
    try {
      const history = [...messages, { role: 'user' as const, content: textToSend.trim() }];
      const result = await window.electronAPI?.agent.chat({
        workspacePath,
        messages: history.map((m) => ({ role: m.role, content: m.content })),
      });
      setStreamingContent(null);
      if (result?.error) {
        setError(result.error);
      } else if (
        result &&
        (result.content !== undefined ||
          (result.formFields && result.formFields.length > 0) ||
          (result.suggestedOptions && result.suggestedOptions.length > 0))
      ) {
        const assistantContent = result.content ?? '';
        addMessage({
          role: 'assistant',
          content: assistantContent,
          options: result.suggestedOptions,
          formFields: result.formFields,
        });
        const mermaidBlock = extractMermaidBlocks(assistantContent) ?? extractPartialMermaidBlocks(assistantContent);
        if (mermaidBlock) {
          useDiagramStore.getState().setDiagram(mermaidBlock, null);
        }
      }
    } catch (e) {
      setStreamingContent(null);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    await sendMessageWithText(text);
  };

  return (
    <div className="h-full flex flex-col bg-[#fafafa] min-w-0">
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 min-w-0">
        {messages.length === 0 ? (
          <div className="text-center text-[#9ca3af] text-sm py-12">
            Enter a message
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={msg.id} className="space-y-2 min-w-0">
              <div
                className={`p-3 rounded-lg text-sm prose prose-sm max-w-none prose-p:my-1 prose-ul:my-2 prose-li:my-0 break-words ${
                  msg.role === 'user'
                    ? 'bg-[#f0f0f0] text-[#1e1e1e] ml-8'
                    : 'bg-white border border-[#e5e7eb] text-[#1e1e1e] mr-8 prose-headings:text-[#1e1e1e] prose-strong:text-[#1e1e1e] prose-p:text-[#1e1e1e] prose-li:text-[#1e1e1e] prose-ul:text-[#1e1e1e]'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <ReactMarkdown
                    allowElement={(element) => {
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
                    }}
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
                      className="px-3 py-1.5 rounded-lg border border-[#d1d5db] bg-white text-sm hover:bg-[#fafafa]"
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
          <div className="p-3 rounded-lg text-sm bg-[#ffc9c9] text-[#1e1e1e]">
            {error}
          </div>
        )}
        {isLoading && (
          <div className="space-y-2 min-w-0">
            {streamingContent ? (
              <div
                className="p-3 rounded-lg text-sm prose prose-sm max-w-none prose-p:my-1 prose-ul:my-2 prose-li:my-0 break-words bg-white border border-[#e5e7eb] text-[#1e1e1e] mr-8 prose-headings:text-[#1e1e1e] prose-strong:text-[#1e1e1e] prose-p:text-[#1e1e1e] prose-li:text-[#1e1e1e] prose-ul:text-[#1e1e1e]"
              >
                <ReactMarkdown
                  allowElement={(element) => {
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
                  }}
                  components={{}}
                >
                  {streamingContent}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="p-3 rounded-lg text-sm text-[#6b6b6b] ml-8 flex items-center gap-1">
                <GeneratingDots />
              </div>
            )}
          </div>
        )}
      </div>
      <div className="p-4 border-t border-[#e5e7eb] bg-white">
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
          className="w-full px-4 py-2 rounded-lg border border-[#e5e7eb] bg-[#fafafa] text-[#1e1e1e] placeholder-[#9ca3af] text-sm focus:outline-none focus:border-[#d1d5db] resize-y min-h-[60px]"
        />
      </div>
    </div>
  );
}
