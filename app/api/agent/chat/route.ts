import { createAgent, AVAILABLE_MODELS } from '@/lib/agent';
import type { ModelId } from '@/lib/agent';

export const maxDuration = 300;

export async function POST(request: Request) {
  const { workspacePath, messages, modelId } = await request.json();

  const selectedModel = AVAILABLE_MODELS.find((m) => m.id === modelId) ?? AVAILABLE_MODELS[0];

  // Pick the right API key based on provider
  const apiKey =
    selectedModel.provider === 'anthropic'
      ? process.env.ANTHROPIC_API_KEY
      : process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const envVar = selectedModel.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
    return new Response(
      `event: error\ndata: ${JSON.stringify({ error: `Please set ${envVar} in .env.local file.` })}\n\n`,
      { headers: sseHeaders() }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(event: string, data: object) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const agent = await createAgent(
          apiKey,
          workspacePath,
          (content) => sendEvent('content_delta', { content }),
          (mermaid, relatedPaths) => sendEvent('diagram_update', { mermaid, relatedPaths: relatedPaths ?? null }),
          (modelId as ModelId) || 'gpt-4o'
        );

        const msgs = messages.map((m: { role: string; content: string }) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

        const response = await agent.run(msgs);

        sendEvent('done', {
          content: response.content,
          toolCalls: response.toolCalls,
          suggestedOptions: response.suggestedOptions,
          formFields: response.formFields,
        });
      } catch (err) {
        sendEvent('error', { error: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

function sseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  };
}
