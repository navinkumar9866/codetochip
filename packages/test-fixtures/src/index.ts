// Test doubles for the flasher: replay real recordings, or simulate a bootloader's behaviour.
export type { Transcript, TranscriptEntry } from '@codetochip/flasher';
export { transcripts, recordedBannerChunks, recordedStartMessage } from './transcripts.ts';
export { createReplayDevice, imageFromTranscript } from './replay.ts';
export { createMockVegaBootloader, type MockVegaOptions } from './mock-vega.ts';
