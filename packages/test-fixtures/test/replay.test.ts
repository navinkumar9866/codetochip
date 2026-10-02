// Golden tests: our protocol must send exactly what it sent to the real ARIES v3 at Gate 0.
import { describe, expect, it } from 'vitest';
import { flashOptionsFor, getBoard } from '@codetochip/boards';
import { CancelledError, fromHex, vegaXmodemProtocol, type Transcript } from '@codetochip/flasher';
import { createReplayDevice, imageFromTranscript, transcripts } from '../src/index.ts';

const aries = getBoard('aries-v3')!;
const ram = { ...flashOptionsFor(aries, 'ram'), handshakeTimeoutMs: 5000 };

async function replay(transcript: Transcript, abortAfterPackets?: number) {
  const device = createReplayDevice(transcript);
  const controller = new AbortController();
  if (abortAfterPackets) {
    const write = device.transport.write;
    let packets = 0;
    device.transport.write = async (data) => {
      await write(data);
      if (data[0] === 0x01 && ++packets === abortAfterPackets) controller.abort();
    };
  }
  const flashing = vegaXmodemProtocol.flash(
    device.transport,
    imageFromTranscript(transcript),
    ram,
    () => {},
    controller.signal,
  );
  await new Promise((r) => setTimeout(r, 10)); // let the protocol start listening
  void device.start();
  const outcome = await flashing.then(
    () => 'ok',
    (e: unknown) => e,
  );
  return { device, outcome };
}

describe('replay of real Gate 0 sessions', () => {
  it.each([
    ['board already waiting: hello-serial', transcripts.helloSerial],
    ['RESET pressed, full banner: blink', transcripts.blinkManualReset],
    ['RESET after a cancel: hello-serial', transcripts.recoverAfterCancel],
  ])(
    '%s: byte-identical host writes',
    async (_, transcript) => {
      const { device, outcome } = await replay(transcript);
      expect(outcome).toBe('ok');
      expect(device.mismatches).toEqual([]);
      expect(device.written).toEqual(device.expectedWrites);
    },
    15_000,
  );

  it('cancel mid-transfer: same packets, then CAN CAN, like the real session', async () => {
    const t = transcripts.cancelledMidway;
    const packets = t.entries.filter((e) => e.dir === 'tx' && e.hex.startsWith('01')).length;
    const { device, outcome } = await replay(t, packets);
    expect(outcome).toBeInstanceOf(CancelledError);
    expect(device.mismatches).toEqual([]);
    expect(device.written.at(-1)).toBe('1818');
    expect(device.written).toEqual(device.expectedWrites);
  }, 30_000);
});

describe('recorded hardware facts', () => {
  it('DTR/RTS pulses never interrupt the bootloader’s C every ~190 ms (no reset)', () => {
    const e = transcripts.resetExperiments.entries;
    const rx = e.filter((x) => x.dir === 'rx');
    expect(e.filter((x) => x.dir === 'signal').length).toBeGreaterThanOrEqual(8);
    expect(rx.every((x) => x.hex === '43')).toBe(true);
    const gaps = rx.slice(1).map((x, i) => x.t - rx[i]!.t);
    expect(Math.max(...gaps)).toBeLessThan(250);
    const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]!;
    expect(median).toBeGreaterThan(170);
    expect(median).toBeLessThan(210);
  });

  it('the bootloader goes silent after CAN CAN', () => {
    const e = transcripts.cancelledMidway.entries;
    const can = e.findIndex((x) => x.dir === 'tx' && x.hex === '1818');
    const after = e.slice(can + 1).filter((x) => x.dir === 'rx');
    expect(after.map((x) => x.hex)).toEqual(['06']); // the ACK already in flight, then nothing
    expect(new TextDecoder().decode(fromHex(e.find((x) => x.dir === 'rx')!.hex))).toBeTruthy();
  });
});
