import mermaid from 'mermaid';

let initialized = false;
let _renderCount = 0;

type MermaidDiagramType = 'flowchart' | 'sequence' | 'er' | 'state' | 'class' | 'other';

/** Detect the diagram type from mermaid source. */
function detectDiagramType(source: string): MermaidDiagramType {
  const s = source.trim();
  if (/^(flowchart|graph)\s/im.test(s)) return 'flowchart';
  if (/^sequenceDiagram/im.test(s)) return 'sequence';
  if (/^erDiagram/im.test(s)) return 'er';
  if (/^stateDiagram/im.test(s)) return 'state';
  if (/^classDiagram/im.test(s)) return 'class';
  return 'other';
}

function ensureInitialized() {
  if (!initialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      themeVariables: {
        darkMode: true,
        background: '#0a0a0a',
        primaryColor: '#1e293b',
        primaryTextColor: '#e2e8f0',
        primaryBorderColor: '#475569',
        lineColor: '#94a3b8',
        secondaryColor: '#1e1e2e',
        tertiaryColor: '#1a1a2e',
        noteBkgColor: '#1e293b',
        noteTextColor: '#cbd5e1',
        noteBorderColor: '#475569',
        edgeLabelBackground: '#1e293b',
        clusterBkg: '#111827',
        clusterBorder: '#475569',
        titleColor: '#f1f5f9',
      },
    });
    initialized = true;
  }
}

/** Extract mermaid code blocks from markdown content. Returns the last block found, or null. */
export function extractMermaidBlocks(content: string): string | null {
  const matches = [...(content.matchAll(/```\s*mermaid\s*\n([\s\S]*?)```/gi) ?? [])];
  return matches.length ? matches[matches.length - 1][1].trim() : null;
}

/** Extract mermaid block including partial (for streaming). If no closing ```, returns content from ```mermaid to end. */
export function extractPartialMermaidBlocks(content: string): string | null {
  const complete = extractMermaidBlocks(content);
  if (complete) return complete;
  const startMatch = content.match(/```\s*mermaid\s*\n([\s\S]*)/i);
  return startMatch ? startMatch[1].trim() : null;
}

/** Check if mermaid source is likely complete enough to parse (avoids passing partial streaming content). */
export function isLikelyCompleteMermaid(source: string): boolean {
  if (!source?.trim()) return false;
  const s = source.trim();
  const openCircle = (s.match(/\(\(/g) || []).length;
  const closeCircle = (s.match(/\)\)/g) || []).length;
  if (openCircle !== closeCircle) return false;
  return true;
}

/** Normalize mermaid: graph TB/LR → flowchart TD/LR. */
function normalizeMermaidSource(source: string): string {
  let s = source.replace(/^(\s*)graph\s+(TB|TD|BT|LR|RL)\b/gim, '$1flowchart $2');
  s = s.replace(/\\n/g, '\n');
  return s;
}

/** Sanitize source for Mermaid 11 — only apply flowchart-specific rules to flowcharts. */
function sanitizeForMermaid11(source: string): string {
  const diagramType = detectDiagramType(source);

  // Only apply flowchart-specific sanitization to flowcharts
  if (diagramType === 'flowchart') {
    return source
      .replace(/(\w+)\(([^()]*%[^()]*)\)/g, (_, id, label) =>
        `${id}["${label.replace(/"/g, '\\"')}"]`
      );
  }

  return source;
}

function isMermaidErrorSvg(svg: string): { isError: boolean; reason?: string } {
  if (svg.includes('aria-roledescription="error"')) return { isError: true, reason: 'aria-roledescription' };
  if (svg.includes('Syntax error in text')) return { isError: true, reason: 'Syntax error in text' };
  return { isError: false };
}

function cleanupMermaidDom(): void {
  if (typeof document === 'undefined') return;
  // Only remove direct children of body — mermaid appends temp containers there.
  // Do NOT use document.querySelectorAll which would also remove React-managed SVG elements.
  document.body.querySelectorAll(':scope > [id^="dmermaid-"], :scope > [id^="mermaid-"]').forEach((el) => el.remove());
}

export interface RenderResult {
  svg: string | null;
  error?: string;
}

export async function renderMermaidToSvg(source: string): Promise<string | null> {
  const result = await renderMermaidDetailed(source);
  return result.svg;
}

export async function renderMermaidDetailed(source: string): Promise<RenderResult> {
  if (!source?.trim()) return { svg: null };
  let normalized = normalizeMermaidSource(source.trim());
  normalized = sanitizeForMermaid11(normalized);
  const id = `mermaid-r${++_renderCount}`;
  try {
    ensureInitialized();
    const { svg } = await mermaid.render(id, normalized);
    cleanupMermaidDom();
    const errCheck = isMermaidErrorSvg(svg);
    if (errCheck.isError) return { svg: null, error: `Mermaid produced error SVG: ${errCheck.reason}` };
    return { svg };
  } catch (e1) {
    cleanupMermaidDom();
    // Retry with a fresh unique ID
    try {
      ensureInitialized();
      const { svg } = await mermaid.render(`mermaid-r${++_renderCount}`, normalized);
      cleanupMermaidDom();
      if (isMermaidErrorSvg(svg).isError) return { svg: null, error: 'Mermaid produced error SVG on retry' };
      return { svg };
    } catch (e2) {
      cleanupMermaidDom();
      const errMsg = (e2 as Error).message || (e1 as Error).message || 'Unknown mermaid error';
      console.error('[renderMermaid] Parse failed:', errMsg, '\nSource:\n', normalized.slice(0, 500));
      return { svg: null, error: errMsg };
    }
  }
}
