# C3 — Canton Contract Catalyst

AI-powered DAML smart contract design tool built for the Canton network.

## Features

- **AI-Powered Design** — Describe contract requirements in plain language. The AI architects complete DAML solutions through iterative conversation.
- **Production-Ready Codebase** — Get complete DAML project files (templates, choices, test scenarios, daml.yaml). Export as ZIP and deploy directly.
- **Multi-View Diagrams** — Auto-generated flowcharts, sequence diagrams, ER diagrams, and state diagrams that evolve with your design.
- **Financial Domain Intelligence** — Optimized for financial contracts with built-in knowledge of global regulatory frameworks, financial instruments, and industry standards.
- **Model Selection** — Choose between OpenAI (GPT-4o, GPT-4o Mini) and Anthropic (Claude Sonnet 4, Claude 3.7 Sonnet) models.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **AI**: OpenAI SDK, Anthropic SDK
- **State**: Zustand
- **Diagrams**: Mermaid
- **Styling**: Tailwind CSS
- **Export**: JSZip

## Getting Started

```bash
pnpm install
```

Create `.env.local`:

```
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
```

Run the dev server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
app/            # Next.js pages and API routes
components/     # React UI components
lib/            # AI agent, export, workspace logic
store/          # Zustand state stores
utils/          # Mermaid rendering utilities
```

## License

Private
