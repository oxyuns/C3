import { AVAILABLE_MODELS } from '@/lib/agent';
import { NextResponse } from 'next/server';

export async function GET() {
  const models = AVAILABLE_MODELS.map((m) => ({
    id: m.id,
    provider: m.provider,
    label: m.label,
    available:
      m.provider === 'anthropic'
        ? !!process.env.ANTHROPIC_API_KEY
        : !!process.env.OPENAI_API_KEY,
  }));

  return NextResponse.json({ models });
}
