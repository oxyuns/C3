import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { SectionId } from './prompts';
import { getSectionCatalog, ALWAYS_INCLUDE, ALL_SECTIONS } from './prompts';
import type { AgentMessage, ModelProvider } from './index';

const ROUTER_PROMPT = `You are a prompt router. Given the user's latest message and recent conversation context, decide which prompt sections are needed to answer well.

${getSectionCatalog()}

Rules:
- Return ONLY a JSON array of section ID strings, e.g. ["03-daml-expertise","06-diagram-rules"]
- Only include sections that are clearly relevant to the current user request
- If unsure whether a section is needed, include it
- Sections "01-identity", "02-daml-implementation", "07-workspace-tools" are always included automatically — do NOT return these
- Return an empty array [] if no optional sections are needed
- Do NOT include any explanation, just the JSON array`;

/** Maximum number of recent messages to include in router context. */
const ROUTER_CONTEXT_MESSAGES = 4;

function buildRouterUserMessage(messages: AgentMessage[]): string {
  const recent = messages.slice(-ROUTER_CONTEXT_MESSAGES);
  const parts: string[] = [];

  if (recent.length > 1) {
    const context = recent.slice(0, -1);
    parts.push('Recent conversation context:');
    for (const m of context) {
      const truncated = m.content.length > 200 ? m.content.slice(0, 200) + '...' : m.content;
      parts.push(`[${m.role}]: ${truncated}`);
    }
    parts.push('');
  }

  const latest = recent[recent.length - 1];
  parts.push(`Latest user message:\n${latest.content}`);

  return parts.join('\n');
}

function parseRouterResponse(text: string): SectionId[] {
  try {
    // Extract JSON array from response (may have markdown fences)
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) return ALL_SECTIONS;
    const arr = JSON.parse(match[0]) as string[];
    const valid = ALL_SECTIONS.filter((s) => !ALWAYS_INCLUDE.includes(s));
    return arr.filter((s): s is SectionId => valid.includes(s as SectionId));
  } catch {
    // If parsing fails, include all sections as fallback
    return ALL_SECTIONS;
  }
}

export async function routeSections(
  messages: AgentMessage[],
  provider: ModelProvider,
  apiKey: string
): Promise<SectionId[]> {
  const userMessage = buildRouterUserMessage(messages);

  try {
    if (provider === 'openai') {
      const openai = new OpenAI({ apiKey });
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 200,
        temperature: 0,
        messages: [
          { role: 'system', content: ROUTER_PROMPT },
          { role: 'user', content: userMessage },
        ],
      });
      const text = response.choices[0]?.message?.content ?? '[]';
      return parseRouterResponse(text);
    } else {
      const anthropic = new Anthropic({ apiKey });
      const response = await anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 200,
        messages: [
          { role: 'user', content: `${ROUTER_PROMPT}\n\n${userMessage}` },
        ],
      });
      const text = response.content[0]?.type === 'text' ? response.content[0].text : '[]';
      return parseRouterResponse(text);
    }
  } catch {
    // On any router error, fall back to all sections
    return ALL_SECTIONS;
  }
}
