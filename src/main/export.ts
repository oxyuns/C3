import * as fs from 'fs/promises';
import * as path from 'path';
import JSZip from 'jszip';

/** Add specific files from workspace to ZIP by relative paths. */
async function addRelatedFilesToZip(
  zip: JSZip,
  workspacePath: string,
  relatedPaths: string[]
): Promise<void> {
  const normalized = path.normalize(workspacePath);
  for (const rel of relatedPaths) {
    const trimmed = rel.trim();
    if (!trimmed) continue;
    const fullPath = path.resolve(normalized, trimmed);
    if (!fullPath.startsWith(normalized)) continue;
    try {
      const stat = await fs.stat(fullPath);
      if (!stat.isFile()) continue;
      const content = await fs.readFile(fullPath, 'utf-8');
      zip.file(trimmed, content);
    } catch (_) {
      // Skip missing or unreadable files
    }
  }
}

/** Recursively find all .daml files under dir; returns relative paths from workspaceRoot. */
async function findDamlFiles(workspaceRoot: string, dir: string, out: string[]): Promise<void> {
  const normalized = path.normalize(workspaceRoot);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (!path.normalize(full).startsWith(normalized)) continue;
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git') continue;
        await findDamlFiles(workspaceRoot, full, out);
      } else if (e.isFile() && e.name.endsWith('.daml')) {
        const rel = path.relative(workspaceRoot, full);
        if (!rel.startsWith('..')) out.push(rel);
      }
    }
  } catch (_) {
    // Ignore unreadable dirs
  }
}

/** Export diagram and DAML implementation to ZIP. Includes diagram (mmd + md) and DAML files from relatedPaths, or all .daml in workspace if relatedPaths empty. */
export async function exportWorkspace(
  outputPath: string,
  diagramMermaid: string,
  workspacePath?: string,
  relatedPaths?: string[] | null
) {
  if (!diagramMermaid?.trim()) {
    throw new Error('No diagram to export');
  }
  const zip = new JSZip();
  const mermaidTrimmed = diagramMermaid.trim();

  zip.file(
    'diagram.md',
    `# Architecture diagram\n\n\`\`\`mermaid\n${mermaidTrimmed}\n\`\`\`\n`
  );

  const workspace = workspacePath?.trim();
  let damlPaths: string[] =
    relatedPaths?.filter((p) => typeof p === 'string' && p.trim()) ?? [];

  // Deduplicate by basename; when both root and src/ exist, prefer src/
  function dedupeByBasename(paths: string[]): string[] {
    const byBase = new Map<string, string>();
    for (const p of paths) {
      const base = path.basename(p);
      const existing = byBase.get(base);
      if (!existing || (p.includes('src' + path.sep) && !existing.includes('src' + path.sep)))
        byBase.set(base, p);
    }
    return [...byBase.values()];
  }
  damlPaths = dedupeByBasename(damlPaths);

  if (workspace) {
    if (damlPaths.length > 0) {
      await addRelatedFilesToZip(zip, workspace, damlPaths);
      // Include daml.yaml from workspace root if present so the export is buildable
      const damlYamlPath = 'daml.yaml';
      if (!damlPaths.some((p) => path.basename(p) === 'daml.yaml')) {
        try {
          const full = path.resolve(path.normalize(workspace), damlYamlPath);
          if (full.startsWith(path.normalize(workspace))) {
            await fs.stat(full);
            const content = await fs.readFile(full, 'utf-8');
            zip.file(damlYamlPath, content);
            damlPaths = [damlYamlPath, ...damlPaths];
          }
        } catch (_) {
          // daml.yaml missing, skip
        }
      }
    } else {
      const discovered: string[] = [];
      await findDamlFiles(workspace, workspace, discovered);
      const uniqueDiscovered = dedupeByBasename(discovered);
      if (uniqueDiscovered.length > 0) {
        await addRelatedFilesToZip(zip, workspace, uniqueDiscovered);
        damlPaths = uniqueDiscovered;
        try {
          const full = path.resolve(path.normalize(workspace), 'daml.yaml');
          if (full.startsWith(path.normalize(workspace))) {
            await fs.stat(full);
            const content = await fs.readFile(full, 'utf-8');
            zip.file('daml.yaml', content);
            damlPaths = ['daml.yaml', ...damlPaths];
          }
        } catch (_) {}
      }
    }
  }

  const readmeLines = [
    '# Canton contract export',
    '',
    'This archive contains the architecture diagram and the DAML implementation.',
    '',
    '## Contents',
    '- `diagram.md` – Architecture diagram (Mermaid, viewable as Markdown)',
  ];
  if (damlPaths.length > 0) {
    readmeLines.push('- DAML files:', ...damlPaths.map((p) => `  - \`${p}\``));
  } else {
    readmeLines.push('- No DAML files were included (none linked to the diagram or found in the workspace).');
  }
  zip.file('README.md', readmeLines.join('\n') + '\n');

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(outputPath, buffer);
}
