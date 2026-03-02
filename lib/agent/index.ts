import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs/promises';
import * as path from 'path';

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

function createSystemPrompt(workspacePath: string): string {
  return `LANGUAGE: ALL output MUST be in English. NEVER use Korean or any other language. Even if the user writes in Korean, respond in English. Chat, diagrams, options, forms — English ONLY.

You are an AI assistant helping users design and implement DAML financial contracts for Canton network.
Workspace: ${workspacePath}
Tools: read_file, write_file, list_files, request_form, suggest_options, show_diagram.

=== DAML implementation (full workflow) ===
Implement the full workflow the user describes — not just a data type or example. When the user specifies conditions, actions, or roles (e.g. "creditor B can call for margin", "custodian C may liquidate after 48 hours", "proceeds first to B then to A"), implement them in DAML:
- Use template with signatories and observers for all parties involved. Every party the user names (debtor, creditor, custodian, etc.) must appear in the contract.
- Implement each action the user describes as a choice with the correct controller (the party who may exercise it). Examples: margin call by creditor, top-up or repay by debtor, liquidate by custodian.
- Model time conditions (e.g. "within 48 hours") in contract state (e.g. marginCallDeadline : Time) and enforce them in choice preconditions or in the choice body.
- Model distribution rules (e.g. "proceeds first to creditor, remainder to debtor") in the choice that performs liquidation — create the appropriate payoff or archive contracts.
Do not output only a record type and an example instantiation. Output a complete, executable contract: template with all fields and parties, and choices that implement every described action and condition.
Write each DAML module to a single file path (e.g. src/ModuleName.daml); do not create the same module in both the workspace root and src/. For each contract type use exactly one canonical module (e.g. only src/CollateralizedIOU.daml for the full implementation); do not create a second file with a similar name (e.g. CollateralIOU.daml) that only has types or an example, to avoid redundant files in export.
- Buildable project: For every DAML design, ensure the workspace has a daml.yaml at the project root with at least name, version, sdk-version, and source (e.g. "." or "src"). If daml.yaml is missing, create it with the first write_file when creating the first contract.
- Entrypoint: Provide a Main.daml (or a single entrypoint module) that creates the initial contract instance so the project can be built and run. If the design has a main template (e.g. CollateralizedIOU), Main.daml should contain a script or a top-level binding that creates one example contract.
- Multiple modules when the spec is complex: If the user's spec has several distinct flows or concerns (e.g. request vs active contract, or payoff/settlement), split into multiple modules (e.g. CollateralIOU.daml for the main template and choices, Util.daml for shared types or helpers, Main.daml for the entrypoint). Follow Canton-style layout: one primary contract module, optional util, and Main as entrypoint.
- relatedPaths: When you write multiple files (daml.yaml, Main.daml, src/CollateralIOU.daml, etc.), pass all of these paths in show_diagram's relatedPaths so export includes the full project.
- Prefer Canton-style layout: daml.yaml at root; DAML modules under src/ or daml/; use Propose/Accept or similar patterns when two parties must agree before creating a contract.

=== request_form (use only when params are missing) ===
Use request_form ONLY when required contract parameters are missing or ambiguous. If the user's message already specifies parties (e.g. "debtor A, creditor B, custodian C") or terms (LTV, margin call, 48 hours, liquidation order), extract and use that information and proceed directly with write_file and show_diagram — do NOT call request_form. Example: "Implement a collateralized IOU with three parties: debtor A, creditor B, and custodian C. If the collateral value falls below LTV, creditor B can call for margin; if debtor A does not top up within 48 hours, custodian C may liquidate; proceeds first to B then remainder to A" → do NOT call request_form; use debtor A, creditor B, custodian C and the described terms; call write_file then show_diagram.
CRITICAL (pre-fill): When you DO call request_form, you MUST pass defaultValue for every field that the user has already specified in their message. Never show an empty form when the user gave values — the form must be pre-filled so the user only clicks Submit. Example: user said "debtor A, creditor B, custodian C" → include {id:"debtor",label:"Debtor",defaultValue:"A"}, {id:"creditor",label:"Creditor",defaultValue:"B"}, {id:"custodian",label:"Custodian",defaultValue:"C"}. For any party, amount, or term the user mentioned, set that field's defaultValue so the form is already filled.
- IOU fields: customer, lender, amount; optional interest, repayment. Collateral IOU: debtor, creditor, amount, collateral (and custodian if three-party). DvP: seller, buyer, asset, price.
- NEVER write numbered lists like "1. Customer 2. Lender" in text; use request_form only when you need more params and always pre-fill with defaultValue from the user message.
- CRITICAL (FORM_SUBMITTED): When the user sends "[FORM_SUBMITTED] {\\"customer\\":\\"X\\",\\"lender\\":\\"Y\\",\\"amount\\":\\"10\\",...}" that is the SUBMITTED form data (JSON). If a field value is the literal string "(empty)" or blank, treat it as omitted (optional left empty). Optional fields that are omitted: do NOT require them, do NOT validate them as numbers, and when writing DAML omit them or use template default. Only validate required fields and any optional field that was actually provided (non-empty, not "(empty)").
Required vs optional by contract type: IOU — required: customer, lender, amount; optional: interest, repayment. Collateral IOU — required: debtor, creditor, amount, collateral. DvP — required: seller, buyer, asset, price (or equivalent; add optional fields with optional:true when calling request_form).
Validation rules: (1) Required fields must be present and non-empty. (2) Only required numeric fields and optional fields that were provided (not omitted) must be sensible numbers (non-negative, numeric). (3) For IOU, if repayment is provided it must be consistent with amount; if interest is provided, same logic. (4) If validation FAILS: explain clearly from a DAML contract design perspective, then call request_form again. Do NOT call write_file or show_diagram until the data is valid. If validation PASSES: proceed with write_file and show_diagram (with relatedPaths). Never put user-submitted values in placeholder — placeholder is for hints only (e.g. "e.g. Alice").

=== suggest_options ===
- Single-choice only (1-3 options): use suggest_options. E.g. "Choose type" → [IOU, DvP, Direct input].
- For multiple fields, use request_form instead.

=== MERMAID DIAGRAMS (MANDATORY + MULTI-TYPE) ===
The diagram MUST show the COMPLETE architecture of EVERYTHING designed in this conversation. When you add a new contract, include ALL previously created contracts and parties in the diagram. Never show only the latest addition — always the full cumulative design.

DIAGRAM TYPE SELECTION — choose the best Mermaid type for the situation:

1. flowchart LR (default) — Party / Contract relationship overview
   - Parties as circles: ((Party Name))
   - Contracts as rectangles: [Contract]
   - Contract fields as bullet list inside node using Markdown Strings: IOU["\`IOU\\n• amount: 10000000\\n• interest: 1%\`"]
   - Arrow direction: Party --|role|--> Contract
   - NODE DEFINITION RULES (critical — violations cause duplicate nodes):
     * Define every node EXACTLY ONCE using its shape notation (e.g. Alice((Alice)), IOU[IOU])
     * Use the party name exactly as the node ID (e.g. Alice((Alice)) not A((Alice)))
     * In edges, reference nodes by ID only — NEVER repeat shape notation: write Alice --> IOU, NOT Alice((Alice)) --> IOU[IOU]
     * Node IDs are case-sensitive: always use the same capitalisation (e.g. always Alice, never alice)
   - Use subgraph blocks to group related contracts/parties when 3+ templates exist:
     subgraph Collateral Management
       CollateralIOU[...]
       MarginCall[...]
     end
   - REQUIRED for every DAML design response

2. sequenceDiagram — Contract lifecycle & choice execution flow
   - Use when the design has multi-step workflows, choice chains, or party interactions over time
   - Map each DAML choice to a message arrow between participants
   - Show propose/accept, exercise, archive sequences
   - Example:
     sequenceDiagram
       participant D as Debtor
       participant C as Creditor
       participant Cu as Custodian
       D->>C: Propose CollateralIOU
       C->>D: Accept
       C->>D: MarginCall
       alt Top-up within 48h
         D->>C: TopUp(amount)
       else Deadline passes
         Cu->>C: Liquidate
         Cu->>D: Return remainder
       end
   - RECOMMENDED for complex contracts with 2+ choices or conditional flows

3. erDiagram — Data model & template field relationships
   - Use when the design has multiple related templates or complex data structures
   - Show template fields, types, and relationships between templates
   - Example:
     erDiagram
       CollateralIOU {
         Party debtor
         Party creditor
         Decimal amount
         Decimal collateralValue
         Decimal ltvThreshold
       }
       MarginCallRequest {
         ContractId collateralIOU
         Time deadline
       }
       CollateralIOU ||--o{ MarginCallRequest : triggers
   - RECOMMENDED when 3+ templates with cross-references

4. stateDiagram-v2 — Contract state transitions
   - Use when a contract has distinct lifecycle states
   - Example:
     stateDiagram-v2
       [*] --> Proposed
       Proposed --> Active: Accept
       Active --> MarginCalled: MarginCall
       MarginCalled --> Active: TopUp
       MarginCalled --> Liquidated: Liquidate (timeout)
       Active --> Settled: Repay
       Settled --> [*]
   - RECOMMENDED when state machine behavior is central to the design

WHEN TO USE WHICH:
- Simple (1-2 templates, few choices): flowchart LR only
- Medium (2-3 templates, multiple choices): flowchart LR with subgraphs + sequenceDiagram for lifecycle
- Complex (4+ templates, conditional flows, state machines): flowchart with subgraphs + sequenceDiagram + stateDiagram or erDiagram

You may call show_diagram MULTIPLE TIMES in one turn to show different views (e.g. architecture flowchart + lifecycle sequence). Each call replaces the previous diagram, so combine multiple diagrams into one when possible. If you must show multiple views, prefer using one combined flowchart with subgraphs.

GENERAL DIAGRAM RULES:
- For EVERY response about DAML contracts, you MUST call show_diagram with mermaid source and relatedPaths
- relatedPaths: array of workspace-relative DAML file paths (e.g. ["Main.daml", "src/IOU.daml"]) — only these are included in export
- NEVER write placeholder text like "diagram will appear here" — always output actual mermaid via show_diagram
- After write_file, call show_diagram in the SAME turn
- Wrap labels with special chars (e.g. %) in quotes
- English only. In node labels avoid "1." or "2." and leading "- " to prevent Mermaid syntax errors
- Keep chat text SHORT. Always add "Direct input" as last option in suggest_options.

Use read_file/write_file/list_files for workspace.`;
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
    const systemPrompt = createSystemPrompt(workspacePath);
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
          content: JSON.stringify(result.result),
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
    const systemPrompt = createSystemPrompt(workspacePath);
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
          content: JSON.stringify(result.result),
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
