/** Lazy-loads @huggingface/transformers and optional text2text-generation model. Supports optional OpenAI API. */

import { isOpenAIConfigured, remoteChat } from './OpenAIClient';

export { isOpenAIConfigured };

export type TransformersModule = typeof import('@huggingface/transformers');

/** Larger model (783M) for better responses. First load ~larger download; same text2text-generation pipeline. */
const DEFAULT_MODEL_ID = 'Xenova/LaMini-Flan-T5-783M';

/** Unrestricted for now so the LLM can have natural conversation. Re-enable dataset rules when ready. */
export const SYSTEM_PROMPT =
  'You are a helpful, friendly assistant. Have a natural conversation.';

/**
 * Rules for the remote (Groq/OpenAI) assistant: friendly, great at greetings and casual chat, and accurate on tourism data when provided.
 */
export const FRIENDLY_ASSISTANT_RULES =
  'You are a friendly, helpful assistant for the Canada Tourist Visualization app.\n' +
  'Rules:\n' +
  '1. Greetings and casual chat: Respond warmly and naturally to hi, hello, how are you, thanks, bye, and small talk. Keep replies concise (1–3 sentences) unless the user asks for more.\n' +
  '2. General questions: Answer in a friendly, clear way. You can have a normal conversation about everyday topics.\n' +
  '3. Canada tourism data (years 2010–2019): You do NOT have access to the user\'s screen or the current page. For any tourist/visitor numbers in 2010–2019, use ONLY the "Dataset summary" or "Dataset slice" provided below in this message. That text is the app\'s filtered data sent to you—do not infer from memory or guess. Quote the numbers exactly; do not invent figures.\n' +
  '4. Other years (outside 2010–2019): We do not have app data for those years. You may answer from your own knowledge and say that the app dataset covers 2010–2019 from Statistics Canada; for other years you are giving a general answer, not from the app data.\n' +
  '5. Tone: Be warm, polite, and concise. Avoid long paragraphs unless the user asks for detail.';

export const REFUSAL_MESSAGE = 'I can only help with questions about the Canada tourism data and charts.';

/** Set to false to unmute blocklist for testing (no prompts blocked). */
const BLOCKLIST_ENABLED = false;

const BLOCKLIST: RegExp[] = [
  /\b(how to (make|build|hack|kill|hurt|steal|cheat)|illegal|weapon|drugs?|explosive)\b/i,
  /\b(adult|porn|nude|nsfw|underage|child\s*sex)\b/i,
];

export function isBlocked(text: string): boolean {
  if (!BLOCKLIST_ENABLED) return false;
  const t = text.trim().toLowerCase();
  return BLOCKLIST.some((r) => r.test(t));
}

let transformersModule: TransformersModule | null = null;
let loadPromise: Promise<TransformersModule> | null = null;
let pipeline: unknown = null;
let modelReadyPromise: Promise<unknown> | null = null;

export function load(): Promise<TransformersModule> {
  if (transformersModule) return Promise.resolve(transformersModule);
  if (loadPromise) return loadPromise;
  loadPromise = import('@huggingface/transformers').then((mod) => {
    transformersModule = mod as TransformersModule;
    return transformersModule;
  });
  return loadPromise;
}

export function loadModel(modelId: string = DEFAULT_MODEL_ID): Promise<unknown> {
  if (pipeline) return Promise.resolve(pipeline);
  if (modelReadyPromise) return modelReadyPromise;
  modelReadyPromise = load().then((mod) =>
    mod.pipeline('text2text-generation', modelId).then((p) => {
      pipeline = p;
      console.log('[LLM] loadModel: pipeline ready, modelId=', modelId);
      return p;
    })
  );
  return modelReadyPromise;
}

export function whenReady(): Promise<unknown> {
  return loadModel();
}

export function isLoaded(): boolean {
  return transformersModule !== null;
}

export function isModelReady(): boolean {
  return pipeline !== null || isOpenAIConfigured();
}

export function getModule(): TransformersModule | null {
  return transformersModule;
}

export function getPipeline(): unknown {
  return pipeline;
}

const MAX_HISTORY_MESSAGES = 6;

function formatHistory(history: { role: string; content: string }[]): string {
  return history
    .map((m) => (m.role === 'user' ? `User: ${m.content}` : `Assistant: ${m.content}`))
    .join('\n');
}

/**
 * Single entry for chat: uses remote API (Groq/OpenAI) if configured with friendly-assistant rules and optional data context, else local model.
 */
export async function runChat(
  userMessage: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
  dataContext?: string
): Promise<string> {
  if (isOpenAIConfigured()) {
    const messages = [...history.slice(-MAX_HISTORY_MESSAGES), { role: 'user' as const, content: userMessage }];
    console.log('[LLM] runChat: using remote API with rules, messages=', messages.length, 'dataContext=', !!dataContext);
    return remoteChat(messages, {
      systemPrompt: FRIENDLY_ASSISTANT_RULES,
      dataContext,
      max_tokens: 320,
    });
  }
  return runInference(userMessage, history, dataContext);
}

/**
 * @param dataContext - Optional summary of the current dataset (e.g. totals by province) so the model answers from real data.
 */
export async function runInference(
  userMessage: string,
  history: { role: string; content: string }[] = [],
  dataContext?: string
): Promise<string> {
  const pipe = pipeline as (input: string, opts?: { max_new_tokens?: number; repetition_penalty?: number }) => Promise<{ generated_text: string }[]>;
  if (!pipe) throw new Error('Model not ready');
  const window = history.slice(-MAX_HISTORY_MESSAGES);
  const historyBlock = window.length ? formatHistory(window) + '\n\n' : '';
  const dataBlock =
    dataContext && dataContext.trim()
      ? `Dataset summary (use only these numbers):\n${dataContext.trim()}\n\n`
      : '';
  // No system prompt or role: raw model only (history + current user message).
  const input = `${dataBlock}${historyBlock}User: ${userMessage}`;
  console.log('[LLM] runInference: userMessage length=', userMessage.length, '| history messages=', window.length, '| dataContext length=', dataContext?.length ?? 0, '| full prompt length=', input.length);
  const out = await pipe(input, {
    max_new_tokens: 80,
    repetition_penalty: 1.4,
  });
  let result = out?.[0]?.generated_text?.trim() ?? '';
  result = trimRepetition(result);
  console.log('[LLM] runInference: result length=', result.length, '| preview:', result.slice(0, 100) + (result.length > 100 ? '...' : ''));
  return result;
}

/**
 * If the model repeated the same phrase many times, keep only the first occurrence(s) to avoid "hi, hi, hi, hi...".
 */
function trimRepetition(text: string): string {
  if (!text || text.length < 30) return text;
  const commaParts = text.split(/,\s*/);
  if (commaParts.length < 4) return text;
  const first = commaParts[0].trim();
  const same = commaParts.slice(1, 10).every((p) => p.trim().toLowerCase() === first.toLowerCase());
  if (same) return first;
  const spaceParts = text.split(/\s+/);
  const uniq: string[] = [];
  let prev = '';
  for (const p of spaceParts) {
    if (p.toLowerCase() !== prev) {
      uniq.push(p);
      prev = p.toLowerCase();
    }
  }
  const deduped = uniq.join(' ');
  if (deduped.length < text.length * 0.6) return deduped;
  return text;
}
