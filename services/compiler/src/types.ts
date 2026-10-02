import type { ProjectFile } from '@codetochip/data';

/** POST /api/compile body. */
export interface CompileRequest {
  board: string;
  /** Flash mode id from the board manifest; it decides the build options (e.g. linker script). */
  mode: string;
  files: ProjectFile[];
}

/** A validated request, resolved against the board manifest. Everything a worker needs. */
export interface CompileJob {
  boardId: string;
  mode: string;
  toolchain: 'arduino-cli';
  fqbn: string;
  /** Pinned core version, part of the cache key so a core upgrade invalidates old builds. */
  coreVersion: string;
  /** Main sketch name (the .ino file's name without extension). */
  sketch: string;
  files: ProjectFile[];
}

export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'note';
  message: string;
}

export interface CompileResult {
  ok: boolean;
  /** The flashable image (raw .bin) when ok. */
  binary?: Uint8Array;
  diagnostics: Diagnostic[];
  /** Compiler output with sandbox paths and colour codes removed, size-capped. */
  log: string;
  durationMs: number;
}

/** One toolchain family (docs/PLAN.md 2.4). Each has its own worker image. */
export interface ToolchainAdapter {
  readonly kind: CompileJob['toolchain'];
  compile(job: CompileJob, signal?: AbortSignal): Promise<CompileResult>;
}
