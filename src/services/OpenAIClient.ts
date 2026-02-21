/**
 * Optional remote chat APIs: Groq (free tier) or OpenAI (or proxy).
 * Priority: Groq if VITE_GROQ_API_KEY set, else OpenAI/proxy if set, else local model.
 */

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const OPENAI_DEFAULT_MODEL = 'gpt-3.5-turbo';

type Env = { env?: { VITE_GROQ_API_KEY?: string; VITE_OPENAI_API_KEY?: string; VITE_OPENAI_API_URL?: string } };

function getEnv(): Env['env'] {
  return (import.meta as unknown as Env).env;
}

function getGroqApiKey(): string | undefined {
  return getEnv()?.VITE_GROQ_API_KEY?.trim();
}

function getOpenApiKey(): string | undefined {
  return getEnv()?.VITE_OPENAI_API_KEY?.trim();
}

function getProxyUrl(): string | undefined {
  const url = getEnv()?.VITE_OPENAI_API_URL?.trim();
  return url || undefined;
}

/** True if any remote API is configured (Groq preferred over OpenAI). */
export function isRemoteConfigured(): boolean {
  return !!(getGroqApiKey() || getOpenApiKey() || getProxyUrl());
}

/** Alias for isRemoteConfigured (used by LLMLoader/controller). */
export function isOpenAIConfigured(): boolean {
  return isRemoteConfigured();
}

/**
 * Call remote chat API: Groq if key set, else OpenAI/proxy. Same request/response shape.
 * When systemPrompt and/or dataContext are provided, a system message is prepended for friendly rules and dataset.
 */
export async function remoteChat(
  messages: { role: 'user' | 'assistant'; content: string }[],
  options?: { model?: string; max_tokens?: number; systemPrompt?: string; dataContext?: string }
): Promise<string> {
  const conversationMessages = messages.map((m) => ({ role: m.role, content: m.content }));
  let allMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = conversationMessages;
  if (options?.systemPrompt || options?.dataContext) {
    const systemParts: string[] = [];
    if (options.systemPrompt?.trim()) systemParts.push(options.systemPrompt.trim());
    if (options.dataContext?.trim()) systemParts.push('---\nDataset summary (use ONLY these numbers for tourism/visitor questions; you do not see the user\'s screen):\n' + options.dataContext.trim());
    allMessages = [{ role: 'system', content: systemParts.join('\n\n') }, ...conversationMessages];
  }

  const groqKey = getGroqApiKey();
  if (groqKey) {
    const body = {
      model: options?.model ?? GROQ_DEFAULT_MODEL,
      messages: allMessages,
      max_tokens: options?.max_tokens ?? 256,
    };
    const res = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(err?.error?.message ?? `Groq error: ${res.status}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data?.choices?.[0]?.message?.content?.trim() ?? '';
  }

  const proxyUrl = getProxyUrl();
  const openKey = getOpenApiKey();
  const openaiBody = {
    model: options?.model ?? OPENAI_DEFAULT_MODEL,
    messages: allMessages,
    max_tokens: options?.max_tokens ?? 256,
  };

  if (proxyUrl) {
    const res = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(openaiBody),
    });
    if (!res.ok) throw new Error(`OpenAI proxy error: ${res.status} ${res.statusText}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data?.choices?.[0]?.message?.content?.trim() ?? '';
  }

  if (!openKey) throw new Error('No remote API key set (VITE_GROQ_API_KEY or VITE_OPENAI_API_KEY)');
  const res = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openKey}`,
    },
    body: JSON.stringify(openaiBody),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `OpenAI error: ${res.status}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data?.choices?.[0]?.message?.content?.trim() ?? '';
}
