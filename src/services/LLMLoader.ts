/** Lazy-loads @huggingface/transformers and optional text2text-generation model. */

export type TransformersModule = typeof import('@huggingface/transformers');

const DEFAULT_MODEL_ID = 'Xenova/LaMini-Flan-T5-248M';

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
