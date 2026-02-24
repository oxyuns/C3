# Canton Contract Catalyst

An Electron desktop app for designing DAML financial contracts with AI assistance. Features a Cursor-style split-panel UI.

## Features

- **Workspace**: Cursor-style folder selection
- **AI Chat**: Collaborate on DAML contract design via OpenAI API
- **Multi-choice Options**: `suggest_options` tool for guided workflow selection
- **Mermaid Diagrams**: Live architecture diagrams rendered in the split panel
- **Excalidraw MCP**: Architecture diagram editing via MCP server
- **Export**: Download DAML codebase + `diagram.excalidraw.json` as a ZIP

## Requirements

- Node.js 18+
- pnpm
- OpenAI API key

## Installation

```bash
pnpm install
```

If you encounter Electron binary errors:
```bash
cd node_modules/.pnpm/electron@*/node_modules/electron && node install.js
```

## Development

```bash
pnpm dev
```

## Build

```bash
pnpm build
```

## Usage

1. **Open Folder**: Select the workspace folder for your DAML project
2. **API Key**: Enter your OpenAI API key in the header and save
3. **Chat**: Type a message or click option buttons to start designing contracts
4. **Export**: Click Export (top-right) to download your DAML codebase as a ZIP

## Project Structure

```
src/
├── main/           # Electron main process
│   ├── agent/      # AI agent (OpenAI, tools)
│   └── export.ts   # ZIP export
├── preload/        # Preload IPC bridge
└── renderer/       # React UI
    └── src/
        ├── components/
        ├── store/
        └── styles/
packages/
└── excalidraw-mcp/ # Excalidraw MCP server subpackage
```
