/** Lazy-loads @huggingface/transformers and optional text2text-generation model. */

export type TransformersModule = typeof import('@huggingface/transformers');

const DEFAULT_MODEL_ID = 'Xenova/flan-t5-base';

export const SYSTEM_PROMPT =
  'You are a statistical analyst for the Canada Tourist Visualization. ' +
  'You know ONLY the mapped dataset provided below (aggregated by year, month, province; the same data the charts use). Do not refer to raw CSV or any other data. ' +
  'Answer ONLY using the numbers in that dataset summary. Do not invent numbers. ' +
  'When the user asks "how many tourists" or for the total, your first sentence MUST be the exact "Use this exact sentence..." line from the summary (copy it word for word). Then you may add one short sentence if needed. ' +
  'Refuse off-topic, illegal, or age-inappropriate requests politely.';

export const REFUSAL_MESSAGE = 'I can only help with questions about the Canada tourism data and charts.';

const BLOCKLIST: RegExp[] = [
  /\b(how to (make|build|hack|kill|hurt|steal|cheat)|illegal|weapon|drugs?|explosive)\b/i,
  /\b(adult|porn|nude|nsfw|underage|child\s*sex)\b/i,
];

export function isBlocked(text: string): boolean {
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
  return pipeline !== null;
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
 * @param dataContext - Optional summary of the current dataset (e.g. totals by province) so the model answers from real data.
 */
export async function runInference(
  userMessage: string,
  history: { role: string; content: string }[] = [],
  dataContext?: string
): Promise<string> {
  const pipe = pipeline as (input: string, opts?: { max_new_tokens?: number }) => Promise<{ generated_text: string }[]>;
  if (!pipe) throw new Error('Model not ready');
  const window = history.slice(-MAX_HISTORY_MESSAGES);
  const historyBlock = window.length ? formatHistory(window) + '\n\n' : '';
  const dataBlock =
    dataContext && dataContext.trim()
      ? `Dataset summary (use only these numbers):\n${dataContext.trim()}\n\n`
      : '';
  const input = `${SYSTEM_PROMPT}\n\n${dataBlock}${historyBlock}User: ${userMessage}`;
  console.log('[LLM] runInference: userMessage length=', userMessage.length, '| history messages=', window.length, '| dataContext length=', dataContext?.length ?? 0, '| full prompt length=', input.length);
  const out = await pipe(input, { max_new_tokens: 256 });
  const result = out?.[0]?.generated_text?.trim() ?? '';
  console.log('[LLM] runInference: result length=', result.length, '| preview:', result.slice(0, 100) + (result.length > 100 ? '...' : ''));
  return result;
}
