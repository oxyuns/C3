import * as fs from 'fs/promises';
import * as path from 'path';

export type SectionId =
  | '01-identity'
  | '02-daml-implementation'
  | '03-daml-expertise'
  | '04-financial-domain'
  | '05-form-handling'
  | '06-diagram-rules'
  | '07-workspace-tools'
  | '08-financial-calculations';

/** Sections that are always included regardless of router decision. */
export const ALWAYS_INCLUDE: SectionId[] = [
  '01-identity',
  '02-daml-implementation',
  '07-workspace-tools',
];

/** All available section IDs in order. */
export const ALL_SECTIONS: SectionId[] = [
  '01-identity',
  '02-daml-implementation',
  '03-daml-expertise',
  '04-financial-domain',
  '05-form-handling',
  '06-diagram-rules',
  '07-workspace-tools',
  '08-financial-calculations',
];

let cachedSections: Map<SectionId, string> | null = null;

async function loadAllSections(): Promise<Map<SectionId, string>> {
  if (cachedSections) return cachedSections;

  const dir = path.join(process.cwd(), 'lib', 'agent', 'prompts');
  const entries = await fs.readdir(dir);
  const mdFiles = entries.filter((f) => f.endsWith('.md')).sort();

  const sections = new Map<SectionId, string>();
  for (const file of mdFiles) {
    const id = file.replace('.md', '') as SectionId;
    const content = await fs.readFile(path.join(dir, file), 'utf-8');
    sections.set(id, content.trim());
  }

  cachedSections = sections;
  return sections;
}

/**
 * Build system prompt from selected sections only.
 * Always includes ALWAYS_INCLUDE sections.
 */
export async function buildSystemPrompt(
  workspacePath: string,
  selectedSections?: SectionId[]
): Promise<string> {
  const sections = await loadAllSections();

  const include = new Set<SectionId>(ALWAYS_INCLUDE);
  if (selectedSections) {
    for (const s of selectedSections) include.add(s);
  } else {
    // Fallback: include all
    for (const s of ALL_SECTIONS) include.add(s);
  }

  const parts: string[] = [];
  for (const id of ALL_SECTIONS) {
    if (include.has(id) && sections.has(id)) {
      parts.push(sections.get(id)!);
    }
  }

  return parts.join('\n\n').replace(/\{\{WORKSPACE_PATH\}\}/g, workspacePath);
}

/**
 * Returns a short description of each selectable section for the router prompt.
 */
export function getSectionCatalog(): string {
  return `Available prompt sections (return the IDs that are relevant):
- "03-daml-expertise": DAML language details — template structure, signatories, choice types, contract keys, privacy model, interfaces, anti-patterns, best practices. Include when writing or reviewing DAML code.
- "04-financial-domain": Detailed financial instrument knowledge — bonds, equities, repo, loans, derivatives, digital assets, insurance, trade finance, structured/project finance, settlement, netting, collateral, day count conventions. Include when the user mentions a specific financial product.
- "05-form-handling": Rules for request_form and suggest_options tools — when to show forms, pre-filling, validation, FORM_SUBMITTED handling. Include when the conversation involves collecting user input via forms.
- "06-diagram-rules": Mermaid diagram generation rules — flowchart, sequenceDiagram, erDiagram, stateDiagram, advanced multi-party layouts, subgraphs. Include when generating or updating diagrams.
- "08-financial-calculations": Python code generation for IRR, NPV, DSCR, cash flow projections, waterfall distributions. Include when the user asks for calculations or financial modeling.`;
}
