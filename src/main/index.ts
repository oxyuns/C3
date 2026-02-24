import 'dotenv/config';
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as fs from 'fs/promises';
import { join } from 'path';
import { createAgent } from './agent/index.js';
import { exportWorkspace } from './export.js';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#ffffff',
    show: false,
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


function getApiKey(): string | null {
  return process.env.OPENAI_API_KEY || null;
}

ipcMain.handle('workspace:getDefault', async () => {
  const defaultPath = join(app.getPath('documents'), 'CantonCatalyst');
  await fs.mkdir(defaultPath, { recursive: true });
  return { path: defaultPath };
});

ipcMain.handle('workspace:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: 'Select workspace folder',
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return { path: result.filePaths[0] };
  }
  return null;
});

ipcMain.handle('agent:chat', async (_, { workspacePath, messages }: { workspacePath: string; messages: { role: string; content: string }[] }) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { error: 'Please set OPENAI_API_KEY in .env file.' };
  }
  try {
    const agent = await createAgent(
      apiKey,
      workspacePath,
      (content) => mainWindow?.webContents.send('agent:contentDelta', content),
      (mermaid, relatedPaths) => {
        if (process.env.DEBUG) console.log('[main] diagram:mermaidSource sending, len=', mermaid?.length, 'relatedPaths=', relatedPaths?.length);
        mainWindow?.webContents.send('diagram:mermaidSource', { mermaid, relatedPaths: relatedPaths ?? null });
      }
    );
    const msgs = messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    const response = await agent.run(msgs);
    return { content: response.content, toolCalls: response.toolCalls, suggestedOptions: response.suggestedOptions, formFields: response.formFields };
  } catch (err) {
    return { error: (err as Error).message };
  }
});

ipcMain.handle('export:workspace', async (_, diagramMermaid: string, workspacePath?: string | null, relatedPaths?: string[] | null) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Export',
    defaultPath: `canton-export-${Date.now()}.zip`,
    filters: [{ name: 'ZIP', extensions: ['zip'] }],
  });
  if (!result.canceled && result.filePath) {
    try {
      await exportWorkspace(result.filePath, diagramMermaid, workspacePath ?? undefined, relatedPaths ?? undefined);
      return { ok: true, path: result.filePath };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }
  return null;
});
