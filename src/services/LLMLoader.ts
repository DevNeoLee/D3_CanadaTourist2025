/** Lazy-loads @huggingface/transformers and optional text2text-generation model. */

export type TransformersModule = typeof import('@huggingface/transformers');

const DEFAULT_MODEL_ID = 'Xenova/LaMini-Flan-T5-248M';

export const SYSTEM_PROMPT =
  'You are a statistical analyst for the Canada Tourist Visualization dataset (Canadian provincial visitors by year and month). ' +
  'Answer only questions about this dataset and the charts. ' +
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

export async function runInference(
  userMessage: string,
  history: { role: string; content: string }[] = []
): Promise<string> {
  const pipe = pipeline as (input: string, opts?: { max_new_tokens?: number }) => Promise<{ generated_text: string }[]>;
  if (!pipe) throw new Error('Model not ready');
  const window = history.slice(-MAX_HISTORY_MESSAGES);
  const historyBlock = window.length ? formatHistory(window) + '\n\n' : '';
  const input = `${SYSTEM_PROMPT}\n\n${historyBlock}User: ${userMessage}`;
  const out = await pipe(input, { max_new_tokens: 256 });
  return out?.[0]?.generated_text?.trim() ?? '';
}
