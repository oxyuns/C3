import { NextResponse } from 'next/server';
import { getDefaultWorkspacePath, ensureWorkspace } from '@/lib/workspace';

export async function GET() {
  try {
    const defaultPath = getDefaultWorkspacePath();
    await ensureWorkspace(defaultPath);
    return NextResponse.json({ path: defaultPath });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
