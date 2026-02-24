import OpenAI from 'openai';
import * as fs from 'fs/promises';
import * as path from 'path';

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
- CRITICAL (FORM_SUBMITTED): When the user sends "[FORM_SUBMITTED] {\"customer\":\"X\",\"lender\":\"Y\",\"amount\":\"10\",...}" that is the SUBMITTED form data (JSON). If a field value is the literal string "(empty)" or blank, treat it as omitted (optional left empty). Optional fields that are omitted: do NOT require them, do NOT validate them as numbers, and when writing DAML omit them or use template default. Only validate required fields and any optional field that was actually provided (non-empty, not "(empty)").
Required vs optional by contract type: IOU — required: customer, lender, amount; optional: interest, repayment. Collateral IOU — required: debtor, creditor, amount, collateral. DvP — required: seller, buyer, asset, price (or equivalent; add optional fields with optional:true when calling request_form).
Validation rules: (1) Required fields must be present and non-empty. (2) Only required numeric fields and optional fields that were provided (not omitted) must be sensible numbers (non-negative, numeric). (3) For IOU, if repayment is provided it must be consistent with amount; if interest is provided, same logic. (4) If validation FAILS: explain clearly from a DAML contract design perspective, then call request_form again. Do NOT call write_file or show_diagram until the data is valid. If validation PASSES: proceed with write_file and show_diagram (with relatedPaths). Never put user-submitted values in placeholder — placeholder is for hints only (e.g. "e.g. Alice").

=== suggest_options ===
- Single-choice only (1-3 options): use suggest_options. E.g. "Choose type" → [IOU, DvP, Direct input].
- For multiple fields, use request_form instead.

=== MERMAID DIAGRAMS (MANDATORY) ===
The diagram MUST show the COMPLETE architecture of EVERYTHING designed in this conversation. When you add a new contract (IOU, DvP, Collateral, etc.), include ALL previously created contracts and parties in the diagram, plus the new one. Never show only the latest addition — always show the full cumulative design.
Diagram rules: (1) Entities/parties = circles: ((Party Name)). (2) Contracts = rectangles: [ ]. (3) Contract variables (amount, interest, repayment, collateral, etc.) MUST be shown INSIDE the contract rectangle as a bullet list. Use Mermaid "Markdown Strings" so that line breaks and bullets render: wrap the label text in backticks inside the quotes, e.g. IOU["\`IOU\\n• amount: 10000000\\n• interest: 1%\\n• repayment: 100\`"]. Without the backticks, markdown/newlines are not applied and the label stays one line. Do NOT create separate nodes for amount/interest/repayment. Same for DvP/Collateral — put all contract fields as bullets inside the contract node, with \\n between lines inside the backtick-wrapped label.
Arrow direction: Party --|role|--> Contract (parties point TO the contract). Map form fields to DAML roles: customer (borrower)=issuer, lender=holder typically.
For EVERY response about DAML contracts, you MUST call show_diagram with mermaid source (and relatedPaths: array of workspace-relative DAML file paths this diagram represents — only these files are included when user exports).
- Example (IOU with Markdown Strings — backticks around label so newlines apply):
\`\`\`mermaid
flowchart LR
  Customer((Customer Jay)) -->|issuer| IOU["\`IOU\\n• amount: 10000000\\n• interest: 1%\\n• repayment: 100\`"]
  Lender((Lender Tiger)) -->|holder| IOU
\`\`\`
- When you call show_diagram, pass relatedPaths: e.g. ["Main.daml", "src/IOU.daml"] — the DAML files that this diagram depicts. Only these are included in export.
- NEVER write placeholder text like "diagram will appear here". Always output actual mermaid via show_diagram.
- After write_file for IOU/DvP/collateral, call show_diagram in the SAME turn with the diagram and relatedPaths.
- Use flowchart LR. Parties: circles (()). Contracts: rectangles []. Wrap labels with special chars (e.g. %) in quotes. English only. In node labels avoid "1." or "2." and leading "- " to prevent syntax errors.

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
      description: 'Display a Mermaid diagram in the right panel. Call after write_file for IOU/DvP/collateral. Put contract variables (amount, interest, repayment) INSIDE the contract rectangle as bullet list in node label. Pass relatedPaths: workspace-relative paths of DAML files this diagram represents (only these are included on export).',
      parameters: {
        type: 'object',
        properties: {
          mermaid: { type: 'string', description: 'Mermaid diagram source (flowchart LR). Parties as circles (( )), contracts as rectangles with bullet list inside.' },
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
  onDiagramUpdate?: (mermaid: string, relatedPaths?: string[]) => void
) {
  const openai = new OpenAI({ apiKey });

  function reduceStreamChunk(
    acc: { content: string; tool_calls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] },
    delta: StreamDelta
  ): typeof acc {
    const next = { ...acc };
    if (delta.content) next.content = (next.content || '') + delta.content;
    if (delta.tool_calls) {
      const arr = [...(next.tool_calls || [])];
      for (const tc of delta.tool_calls) {
        const idx = tc.index;
        while (arr.length <= idx) arr.push({ id: '', type: 'function' as const, function: { name: '', arguments: '' } });
        const cur = arr[idx];
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.function!.name = (cur.function!.name || '') + tc.function.name;
        if (tc.function?.arguments) cur.function!.arguments = (cur.function!.arguments || '') + tc.function.arguments;
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
        if (process.env.DEBUG) console.log('[agent] show_diagram called, mermaid len=', mermaid.length, 'relatedPaths=', relatedPaths?.length);
        onDiagramUpdate?.(mermaid, relatedPaths);
      }
      return { tool: name, result: { success: true } };
    }
    return { tool: name, result: { error: 'Unknown tool' } };
  }

  async function run(messages: AgentMessage[]): Promise<AgentResponse> {
    const systemPrompt = createSystemPrompt(workspacePath);
    let lastContent = '';
    const toolResults: ToolCallResult[] = [];

    const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    let iterations = 0;
    const maxIterations = 10;
    let stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 4096,
      messages: openaiMessages,
      tools: OPENAI_TOOLS,
      tool_choice: 'auto',
      stream: true,
    });

    while (iterations < maxIterations) {
      let accumulated = { content: '', tool_calls: undefined as OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] | undefined };
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

      stream = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 4096,
        messages: openaiMessages,
        tools: OPENAI_TOOLS,
        tool_choice: 'auto',
        stream: true,
      });
      iterations++;
    }

    const suggestedOptions = toolResults.find((r) => r.tool === 'suggest_options')?.result as { options?: SuggestOption[] } | undefined;
    const formResult = toolResults.find((r) => r.tool === 'request_form')?.result as { fields?: FormField[] } | undefined;
    return {
      content: lastContent,
      toolCalls: toolResults.length > 0 ? toolResults : undefined,
      suggestedOptions: suggestedOptions?.options,
      formFields: formResult?.fields,
    };
  }

  return { run };
}
