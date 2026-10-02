// Backend-agnostic API. Apps depend on these interfaces, never on Firebase directly
// (ADR 0001). The Firebase implementation lives in '@codetochip/data/firebase'.
export * from './schema.ts';
export * from './services.ts';
export {
  createMemoryServices,
  createMemoryProjectRepository,
  type MemoryServiceOptions,
} from './memory.ts';
export { signInWithGoogleKeepingWork } from './upgrade.ts';
export { lazyServices } from './lazy.ts';
