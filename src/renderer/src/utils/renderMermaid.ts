import mermaid from 'mermaid';

let initialized = false;

function ensureInitialized() {
  if (!initialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'neutral',
      securityLevel: 'loose',
      flowchart: {
        htmlLabels: true,
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

/** Normalize mermaid: graph TB/LR → flowchart TD/LR; in Markdown String labels, \n → real newline so line breaks render. */
function normalizeMermaidSource(source: string): string {
  let s = source.replace(/^(\s*)graph\s+(TB|TD|BT|LR|RL)\b/gim, '$1flowchart $2');
  // Markdown Strings (backtick-wrapped labels) use real newlines for line breaks; literal \n in source is shown as text.
  s = s.replace(/\\n/g, '\n');
  if (!s.trimStart().startsWith('%%{init:')) {
    s = '%%{init: {"flowchart": {"htmlLabels": true}}}%%\n' + s;
  }
  return s;
}

/**
 * Sanitize for Mermaid 11: "Syntax error in text" often caused by markdown
 * interpretation of labels, or special chars like %.
 * - Wrap labels containing % in quotes: Interest(1%) → Interest["1%"]
 * - Fix "1." list interpretation
 */
function sanitizeForMermaid11(source: string): string {
  return source
    .replace(/(\d+)\.(\s+)/g, '$1)$2')
    .replace(/^(\s*-\s+)/gm, ' $1')
    .replace(/(\w+)\(([^()]*%[^()]*)\)/g, (_, id, label) => `${id}["${label.replace(/"/g, '\\"')}"]`);
}

/** Mermaid returns an error SVG instead of throwing. Detect and reject it. */
function isMermaidErrorSvg(svg: string): { isError: boolean; reason?: string } {
  if (svg.includes('aria-roledescription="error"')) return { isError: true, reason: 'aria-roledescription' };
  if (svg.includes('Syntax error in text')) return { isError: true, reason: 'Syntax error in text' };
  return { isError: false };
}

/** Remove mermaid-created DOM elements that accumulate on parse errors. */
function cleanupMermaidDom(): void {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('[id^="dmermaid-"], [id^="mermaid-"]').forEach((el) => el.remove());
}

/**
 * Render Mermaid source to SVG string. Returns null on error.
 */
export async function renderMermaidToSvg(source: string): Promise<string | null> {
  if (!source?.trim()) return null;
  let normalized = normalizeMermaidSource(source.trim());
  normalized = sanitizeForMermaid11(normalized);
  const id = 'mermaid-' + Date.now();
  try {
    ensureInitialized();
    const { svg } = await mermaid.render(id, normalized);
    cleanupMermaidDom();
    const errCheck = isMermaidErrorSvg(svg);
    if (errCheck.isError) return null;
    return svg;
  } catch (e1) {
    cleanupMermaidDom();
    normalized = sanitizeForMermaid11(normalized);
    try {
      ensureInitialized();
      const { svg } = await mermaid.render(id + '-retry', normalized);
      cleanupMermaidDom();
      if (isMermaidErrorSvg(svg).isError) return null;
      return svg;
    } catch (e2) {
      cleanupMermaidDom();
      if (import.meta.env?.DEV) console.warn('[renderMermaid] Parse failed (may be partial):', (e2 as Error).message);
      return null;
    }
  }
}
