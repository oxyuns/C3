import mermaid from 'mermaid';

let initialized = false;

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
        primaryColor: '#1a1a1a',
        primaryTextColor: '#ffffff',
        primaryBorderColor: '#2a2a2a',
        lineColor: '#3a3a3a',
        secondaryColor: '#141414',
        tertiaryColor: '#1a1a1a',
        noteBkgColor: '#141414',
        noteTextColor: '#a0a0a0',
        noteBorderColor: '#2a2a2a',
        edgeLabelBackground: '#141414',
        clusterBkg: '#141414',
        clusterBorder: '#2a2a2a',
        titleColor: '#ffffff',
      },
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

/** Normalize mermaid: graph TB/LR → flowchart TD/LR; only prepend flowchart init for flowchart diagrams. */
function normalizeMermaidSource(source: string): string {
  let s = source.replace(/^(\s*)graph\s+(TB|TD|BT|LR|RL)\b/gim, '$1flowchart $2');
  s = s.replace(/\\n/g, '\n');

  const diagramType = detectDiagramType(s);

  // Only prepend flowchart init for flowchart diagrams
  if (diagramType === 'flowchart' && !s.trimStart().startsWith('%%{init:')) {
    s = '%%{init: {"flowchart": {"htmlLabels": true}}}%%\n' + s;
  }

  return s;
}

/** Sanitize source for Mermaid 11 — only apply flowchart-specific rules to flowcharts. */
function sanitizeForMermaid11(source: string): string {
  const diagramType = detectDiagramType(source);

  // Only apply flowchart-specific sanitization to flowcharts
  if (diagramType === 'flowchart') {
    return source
      .replace(/(\d+)\.(\s+)/g, '$1)$2')
      .replace(/^(\s*-\s+)/gm, ' $1')
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
  document.querySelectorAll('[id^="dmermaid-"], [id^="mermaid-"]').forEach((el) => el.remove());
}

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
  } catch {
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
      if (process.env.NODE_ENV === 'development') console.warn('[renderMermaid] Parse failed (may be partial):', (e2 as Error).message);
      return null;
    }
  }
}
