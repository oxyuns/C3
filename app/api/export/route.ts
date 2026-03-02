import { exportWorkspace } from '@/lib/export';

export async function POST(request: Request) {
  try {
    const { diagramMermaid, workspacePath, relatedPaths } = await request.json();

    const buffer = await exportWorkspace(
      diagramMermaid,
      workspacePath ?? undefined,
      relatedPaths ?? undefined
    );

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="canton-export-${Date.now()}.zip"`,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
