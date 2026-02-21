/** Lazy-loads @huggingface/transformers and optional text2text-generation model. Supports optional OpenAI API. */

import { isOpenAIConfigured, remoteChat } from './OpenAIClient';

export { isOpenAIConfigured };

export type TransformersModule = typeof import('@huggingface/transformers');

/** Smaller model (248M) for faster load and less memory; same text2text-generation pipeline. */
const DEFAULT_MODEL_ID = 'Xenova/LaMini-Flan-T5-248M';

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

/** True when the browser reports no network (e.g. user offline). Use to skip remote API and use local LLM directly. */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

/** True when the local pipeline is loaded and can run without network. */
export function isLocalModelReady(): boolean {
  return pipeline !== null;
}

const MAX_HISTORY_MESSAGES = 6;

/** Short instruction so the local model knows to answer the user (reduces generic "Hi, how are you?" for every input). */
const LOCAL_ASSISTANT_INSTRUCTION =
  'Answer the user in 1-2 short sentences. Be friendly and varied. If they greet you, greet back briefly. If they ask a question, answer it directly.';

/** For casual messages (hi, hello, how are you): reply with a short greeting only. No statistics or numbers. */
const LOCAL_CASUAL_INSTRUCTION =
  'The user is just saying hi or greeting you. Reply with one short, friendly greeting only. Do not mention any numbers, statistics, or tourism data.';

function formatHistory(history: { role: string; content: string }[]): string {
  return history
    .map((m) => (m.role === 'user' ? `User: ${m.content}` : `Assistant: ${m.content}`))
    .join('\n');
}

/**
 * Single entry for chat: uses remote API (Groq/OpenAI) if configured and online; when offline uses local model directly (no slow remote timeout).
 * On remote failure (e.g. no internet) falls back to local model when available.
 * @param isCasualMessage - When true, local model does greeting-only reply (no dataset), so "hi" gets "Hi!" not tourism stats.
 */
export async function runChat(
  userMessage: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
  dataContext?: string,
  isCasualMessage?: boolean
): Promise<string> {
  if (isOpenAIConfigured()) {
    const messages = [...history.slice(-MAX_HISTORY_MESSAGES), { role: 'user' as const, content: userMessage }];
    if (isOffline()) {
      console.log('[LLM] runChat: offline detected, using local model directly (no remote attempt).');
      try {
        await loadModel();
        return await runInference(userMessage, history, dataContext, isCasualMessage);
      } catch (localErr) {
        console.error('[LLM] runChat: offline and local model failed', localErr);
        throw new Error('You appear to be offline. The local model could not be loaded. Try again when online, or ensure the local model was downloaded previously.');
      }
    }
    console.log('[LLM] runChat: using remote API with rules, messages=', messages.length, 'dataContext=', !!dataContext);
    try {
      return await remoteChat(messages, {
        systemPrompt: FRIENDLY_ASSISTANT_RULES,
        dataContext,
        max_tokens: 320,
      });
    } catch (remoteErr) {
      console.warn('[LLM] runChat: remote API failed (e.g. no internet), falling back to local model', remoteErr);
      try {
        await loadModel();
        const localResult = await runInference(userMessage, history, dataContext, isCasualMessage);
        return localResult;
      } catch (localErr) {
        console.error('[LLM] runChat: local fallback also failed', localErr);
        throw remoteErr;
      }
    }
  }
  return runInference(userMessage, history, dataContext, isCasualMessage);
}

/**
 * @param dataContext - Optional summary of the current dataset (e.g. totals by province) so the model answers from real data.
 * @param isCasualMessage - When true, use greeting-only instruction and no dataset so "hi" / "hello" get a short greeting, not tourism stats.
 */
export async function runInference(
  userMessage: string,
  history: { role: string; content: string }[] = [],
  dataContext?: string,
  isCasualMessage?: boolean
): Promise<string> {
  type PipeOpts = {
    max_new_tokens?: number;
    repetition_penalty?: number;
    do_sample?: boolean;
    temperature?: number;
  };
  const pipe = pipeline as (input: string, opts?: PipeOpts) => Promise<{ generated_text: string }[]>;
  if (!pipe) throw new Error('Model not ready');
  const window = history.slice(-MAX_HISTORY_MESSAGES);
  const historyBlock = window.length ? formatHistory(window) + '\n\n' : '';
  const instruction = isCasualMessage ? LOCAL_CASUAL_INSTRUCTION : LOCAL_ASSISTANT_INSTRUCTION;
  const dataBlock =
    !isCasualMessage && dataContext && dataContext.trim()
      ? `Dataset summary (use only these numbers):\n${dataContext.trim()}\n\n`
      : '';
  // Instruction + history + current turn; end with "Assistant: " so the model generates the reply.
  const input = `${dataBlock}${instruction}\n\n${historyBlock}User: ${userMessage}\nAssistant: `;
  console.log('[LLM] runInference: userMessage length=', userMessage.length, '| history=', window.length, '| casual=', !!isCasualMessage, '| dataContext length=', dataContext?.length ?? 0, '| prompt length=', input.length);
  const optsWithSampling: PipeOpts = {
    max_new_tokens: 120,
    repetition_penalty: 1.5,
    do_sample: true,
    temperature: 0.8,
  };
  const optsFallback: PipeOpts = { max_new_tokens: 120, repetition_penalty: 1.5 };
  let out: { generated_text: string }[] | undefined;
  try {
    out = await pipe(input, optsWithSampling);
  } catch (e) {
    console.warn('[LLM] runInference: sampling opts not supported, using fallback', e);
    out = await pipe(input, optsFallback);
  }
  let result = out?.[0]?.generated_text?.trim() ?? '';
  result = cleanLocalOutput(result);
  result = trimRepetition(result);
  console.log('[LLM] runInference: result length=', result.length, '| preview:', result.slice(0, 100) + (result.length > 100 ? '...' : ''));
  return result;
}

/**
 * Remove echoed "Assistant:" or trailing "User:" from local model output so the UI shows only the reply.
 */
function cleanLocalOutput(text: string): string {
  let t = text.trim();
  const assistantPrefix = /^Assistant:\s*/i;
  if (assistantPrefix.test(t)) t = t.replace(assistantPrefix, '').trim();
  const userSuffix = /\s*User:.*$/i;
  if (userSuffix.test(t)) t = t.replace(userSuffix, '').trim();
  return t;
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
