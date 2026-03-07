import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { tavily } from '@tavily/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import { buildSystemPrompt } from './prompts';
import { routeSections } from './router';

export type ModelProvider = 'openai' | 'anthropic';
export type ModelId = 'gpt-4o' | 'gpt-4o-mini' | 'claude-sonnet-4-20250514' | 'claude-3-7-sonnet-20250219';

export interface ModelOption {
  id: ModelId;
  provider: ModelProvider;
  label: string;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  { id: 'gpt-4o', provider: 'openai', label: 'GPT-4o' },
  { id: 'gpt-4o-mini', provider: 'openai', label: 'GPT-4o Mini' },
  { id: 'claude-sonnet-4-20250514', provider: 'anthropic', label: 'Claude Sonnet 4' },
  { id: 'claude-3-7-sonnet-20250219', provider: 'anthropic', label: 'Claude 3.7 Sonnet' },
];

type StreamDelta = OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ToolCallResult {
  tool: string;
  result: unknown;
}

export interface SuggestOption {
  id: string;
  label: string;
  payload?: string;
}

export interface FormField {
  id: string;
  label: string;
  optional?: boolean;
  placeholder?: string;
  defaultValue?: string;
}

export interface AgentResponse {
  content: string;
  toolCalls?: ToolCallResult[];
  suggestedOptions?: SuggestOption[];
  formFields?: FormField[];
}

/** Maximum characters for a tool result before truncation. */
const MAX_TOOL_RESULT_CHARS = 3000;

function truncateResult(result: unknown): string {
  const str = JSON.stringify(result);
  if (str.length <= MAX_TOOL_RESULT_CHARS) return str;
  return str.slice(0, MAX_TOOL_RESULT_CHARS) + '\n...[truncated]';
}

function hasMermaidBlock(s: string): boolean {
  return /```\s*mermaid[\s\S]*?```/i.test(s);
}

function pathSafe(workspacePath: string, targetPath: string): string {
  const resolved = path.resolve(workspacePath, targetPath);
  if (!resolved.startsWith(workspacePath)) {
    throw new Error('Path traversal not allowed');
  }
  return resolved;
}

const OPENAI_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a file from the workspace',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Relative path from workspace' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file in the workspace',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path from workspace' },
          content: { type: 'string', description: 'File content' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files in the workspace or a subdirectory',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Relative path, default "."' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_form',
      description: 'Show form only when params are missing. If the user gave full details (parties, amounts, terms), use that data and call write_file + show_diagram — do not call request_form. When you do call request_form, you MUST pass defaultValue for every field the user already specified so the form is pre-filled and the user only clicks Submit; never show an empty form when the user provided values. Do NOT call again after "[FORM_SUBMITTED] {...}". Optional fields may be "(empty)".',
      parameters: {
        type: 'object',
        properties: {
          fields: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Field id, e.g. customer' },
                label: { type: 'string', description: 'Field label, e.g. Customer name and identifier' },
                optional: { type: 'boolean', description: 'If true, field is optional' },
                placeholder: { type: 'string', description: 'Hint only (e.g. "e.g. Alice"). Never put user-submitted values here.' },
                defaultValue: { type: 'string', description: 'Optional pre-filled value when the user already provided this in their message' },
              },
              required: ['id', 'label'],
            },
          },
        },
        required: ['fields'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'suggest_options',
      description: 'Show CLICKABLE option buttons. Use for single-choice (1-3 options). For multiple input fields (customer, lender, amount...), use request_form instead. Always add { "id": "direct_input", "label": "Direct input" } last.',
      parameters: {
        type: 'object',
        properties: {
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                label: { type: 'string' },
                payload: { type: 'string', description: 'Optional value to send when user selects' },
              },
              required: ['id', 'label'],
            },
          },
        },
        required: ['options'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'show_diagram',
      description: 'Display a Mermaid diagram in the right panel. Supports flowchart, sequenceDiagram, erDiagram, stateDiagram-v2, classDiagram. Call after write_file. For flowcharts, put contract variables INSIDE the contract rectangle as bullet list in node label. Pass relatedPaths for export.',
      parameters: {
        type: 'object',
        properties: {
          mermaid: { type: 'string', description: 'Mermaid diagram source. Can be any Mermaid type: flowchart LR/TD, sequenceDiagram, erDiagram, stateDiagram-v2, classDiagram. Use subgraphs in flowcharts to group related elements.' },
          relatedPaths: { type: 'array', items: { type: 'string' }, description: 'Optional. Workspace-relative paths of DAML files this diagram represents (e.g. ["Main.daml", "src/IOU.daml"]). Only these files are included when user exports.' },
        },
        required: ['mermaid'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for up-to-date information about financial instruments, regulations, contract structures, DAML patterns, or any topic the user asks about. Use when your training data may be outdated or when the user asks about specific jurisdictions, regulations, or niche financial products.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
  },
];

export async function createAgent(
  apiKey: string,
  workspacePath: string,
  onContentDelta?: (content: string) => void,
  onDiagramUpdate?: (mermaid: string, relatedPaths?: string[]) => void,
  modelId: ModelId = 'gpt-4o'
) {
  const modelOption = AVAILABLE_MODELS.find((m) => m.id === modelId) ?? AVAILABLE_MODELS[0];
  const openai = modelOption.provider === 'openai' ? new OpenAI({ apiKey }) : null;
  const anthropic = modelOption.provider === 'anthropic' ? new Anthropic({ apiKey }) : null;

  interface AccumulatedToolCall {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }

  function reduceStreamChunk(
    acc: { content: string; tool_calls?: AccumulatedToolCall[] },
    delta: StreamDelta
  ): { content: string; tool_calls?: AccumulatedToolCall[] } {
    const next = { ...acc };
    if (delta.content) next.content = (next.content || '') + delta.content;
    if (delta.tool_calls) {
      const arr = [...(next.tool_calls || [])];
      for (const tc of delta.tool_calls) {
        const idx = tc.index;
        while (arr.length <= idx) arr.push({ id: '', type: 'function' as const, function: { name: '', arguments: '' } });
        const cur = arr[idx];
        if (tc.id) cur.id = tc.id;
        const fn = (tc as unknown as { function?: { name?: string; arguments?: string } }).function;
        if (fn?.name) cur.function.name = (cur.function.name || '') + fn.name;
        if (fn?.arguments) cur.function.arguments = (cur.function.arguments || '') + fn.arguments;
      }
      next.tool_calls = arr;
    }
    return next;
  }

  async function executeTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    if (name === 'read_file') {
      const p = pathSafe(workspacePath, (args.path as string) || '.');
      const content = await fs.readFile(p, 'utf-8');
      return { tool: name, result: content };
    }
    if (name === 'write_file') {
      const p = pathSafe(workspacePath, args.path as string);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, args.content as string);
      return { tool: name, result: { success: true } };
    }
    if (name === 'list_files') {
      const p = pathSafe(workspacePath, (args.path as string) || '.');
      const entries = await fs.readdir(p, { withFileTypes: true });
      const list = entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
      return { tool: name, result: list };
    }
    if (name === 'suggest_options') {
      const opts = (args.options as { id: string; label: string; payload?: string }[]) || [];
      return { tool: name, result: { options: opts } };
    }
    if (name === 'request_form') {
      const fields = (args.fields as { id: string; label: string; optional?: boolean; placeholder?: string; defaultValue?: string }[]) || [];
      return { tool: name, result: { fields } };
    }
    if (name === 'show_diagram') {
      const mermaid = String(args.mermaid ?? '').trim();
      const relatedPaths = Array.isArray(args.relatedPaths)
        ? (args.relatedPaths as string[]).filter((p) => typeof p === 'string' && p.trim())
        : undefined;
      if (mermaid) {
        onDiagramUpdate?.(mermaid, relatedPaths);
      }
      return { tool: name, result: { success: true } };
    }
    if (name === 'web_search') {
      const query = String(args.query ?? '').trim();
      if (!query) return { tool: name, result: { error: 'Empty query' } };
      const tavilyApiKey = process.env.TAVILY_API_KEY;
      if (!tavilyApiKey) return { tool: name, result: { error: 'TAVILY_API_KEY not configured' } };
      const tvly = tavily({ apiKey: tavilyApiKey });
      const response = await tvly.search(query, { maxResults: 5 });
      const results = response.results.map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
      }));
      return { tool: name, result: results };
    }
    return { tool: name, result: { error: 'Unknown tool' } };
  }

  // --- Anthropic tool definitions ---
  const ANTHROPIC_TOOLS: Anthropic.Tool[] = OPENAI_TOOLS
    .filter((t): t is OpenAI.Chat.Completions.ChatCompletionTool & { type: 'function'; function: { name: string; description?: string; parameters?: Record<string, unknown> } } => t.type === 'function')
    .map((t) => ({
      name: t.function.name,
      description: t.function.description ?? '',
      input_schema: (t.function.parameters ?? { type: 'object', properties: {} }) as Anthropic.Tool.InputSchema,
    }));

  // --- OpenAI runner ---
  async function runOpenAI(messages: AgentMessage[]): Promise<AgentResponse> {
    const selectedSections = await routeSections(messages, 'openai', apiKey);
    const systemPrompt = await buildSystemPrompt(workspacePath, selectedSections);
    let lastContent = '';
    const toolResults: ToolCallResult[] = [];

    const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    let iterations = 0;
    const maxIterations = 10;
    let stream = await openai!.chat.completions.create({
      model: modelOption.id,
      max_tokens: 16384,
      messages: openaiMessages,
      tools: OPENAI_TOOLS,
      tool_choice: 'auto',
      stream: true,
    });

    while (iterations < maxIterations) {
      let accumulated: { content: string; tool_calls?: AccumulatedToolCall[] } = { content: '' };
      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice?.delta) continue;
        accumulated = reduceStreamChunk(accumulated, choice.delta);
        if (accumulated.content && onContentDelta) {
          onContentDelta(accumulated.content);
        }
      }

      const textContent = accumulated.content;
      if (textContent) {
        if (hasMermaidBlock(textContent)) lastContent = textContent;
        else if (!hasMermaidBlock(lastContent)) lastContent = textContent;
      }

      const toolCalls = accumulated.tool_calls?.filter((tc) => tc.id && tc.function?.name);
      if (!toolCalls || toolCalls.length === 0) break;

      const msg: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = {
        role: 'assistant',
        content: textContent || null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.function!.name!, arguments: tc.function!.arguments || '{}' },
        })),
      };
      openaiMessages.push(msg);

      for (const tc of toolCalls) {
        const args = tc.function?.arguments ? JSON.parse(tc.function.arguments || '{}') : {};
        const result = await executeTool(tc.function?.name || '', args);
        toolResults.push(result);
        openaiMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: truncateResult(result.result),
        });
      }

      stream = await openai!.chat.completions.create({
        model: modelOption.id,
        max_tokens: 16384,
        messages: openaiMessages,
        tools: OPENAI_TOOLS,
        tool_choice: 'auto',
        stream: true,
      });
      iterations++;
    }

    return extractResults(lastContent, toolResults);
  }

  // --- Anthropic runner ---
  async function runAnthropic(messages: AgentMessage[]): Promise<AgentResponse> {
    const selectedSections = await routeSections(messages, 'anthropic', apiKey);
    const systemPrompt = await buildSystemPrompt(workspacePath, selectedSections);
    let lastContent = '';
    const toolResults: ToolCallResult[] = [];

    const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let iterations = 0;
    const maxIterations = 10;

    while (iterations <= maxIterations) {
      const stream = anthropic!.messages.stream({
        model: modelOption.id,
        max_tokens: 16384,
        system: systemPrompt,
        messages: anthropicMessages,
        tools: ANTHROPIC_TOOLS,
      });

      let textContent = '';

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          const delta = event.delta;
          if ('text' in delta && delta.text) {
            textContent += delta.text;
            onContentDelta?.(textContent);
          }
        }
      }

      const finalMessage = await stream.finalMessage();
      const toolUseBlocks: { id: string; name: string; input: Record<string, unknown> }[] = [];
      textContent = '';

      for (const block of finalMessage.content) {
        if (block.type === 'text') {
          textContent = block.text;
        } else if (block.type === 'tool_use') {
          toolUseBlocks.push({ id: block.id, name: block.name, input: block.input as Record<string, unknown> });
        }
      }

      if (textContent) {
        if (hasMermaidBlock(textContent)) lastContent = textContent;
        else if (!hasMermaidBlock(lastContent)) lastContent = textContent;
        onContentDelta?.(textContent);
      }

      if (toolUseBlocks.length === 0 || finalMessage.stop_reason !== 'tool_use') break;

      anthropicMessages.push({ role: 'assistant', content: finalMessage.content });

      const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUseBlocks) {
        const result = await executeTool(tu.name, tu.input);
        toolResults.push(result);
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: truncateResult(result.result),
        });
      }
      anthropicMessages.push({ role: 'user', content: toolResultBlocks });

      iterations++;
    }

    return extractResults(lastContent, toolResults);
  }

  function extractResults(lastContent: string, toolResults: ToolCallResult[]): AgentResponse {
    const suggestedOptions = toolResults.find((r) => r.tool === 'suggest_options')?.result as { options?: SuggestOption[] } | undefined;
    const formResult = toolResults.find((r) => r.tool === 'request_form')?.result as { fields?: FormField[] } | undefined;
    return {
      content: lastContent,
      toolCalls: toolResults.length > 0 ? toolResults : undefined,
      suggestedOptions: suggestedOptions?.options,
      formFields: formResult?.fields,
    };
  }

  async function run(messages: AgentMessage[]): Promise<AgentResponse> {
    if (modelOption.provider === 'anthropic') {
      return runAnthropic(messages);
    }
    return runOpenAI(messages);
  }

  return { run };
}
