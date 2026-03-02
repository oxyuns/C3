import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';

export function getDefaultWorkspacePath(): string {
  return path.join(homedir(), 'Documents', 'CantonCatalyst');
}

export async function ensureWorkspace(workspacePath: string): Promise<string> {
  await fs.mkdir(workspacePath, { recursive: true });
  return workspacePath;
}

export async function validateWorkspace(workspacePath: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const stat = await fs.stat(workspacePath);
    if (!stat.isDirectory()) {
      return { valid: false, error: 'Path is not a directory' };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'Path does not exist' };
  }
}
