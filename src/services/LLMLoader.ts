/** Lazy-loads @huggingface/transformers (dynamic import). */

export type TransformersModule = typeof import('@huggingface/transformers');

let transformersModule: TransformersModule | null = null;
let loadPromise: Promise<TransformersModule> | null = null;

export function load(): Promise<TransformersModule> {
  if (transformersModule) return Promise.resolve(transformersModule);
  if (loadPromise) return loadPromise;
  loadPromise = import('@huggingface/transformers').then((mod) => {
    transformersModule = mod as TransformersModule;
    return transformersModule;
  });
  return loadPromise;
}

export function isLoaded(): boolean {
  return transformersModule !== null;
}

export function getModule(): TransformersModule | null {
  return transformersModule;
}
