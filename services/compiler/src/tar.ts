// Minimal ustar writer: regular files only, enough to stream sketch sources into a worker
// container on stdin (no host directories are mounted, CLAUDE.md rule 4).

const BLOCK = 512;

export function createTar(files: { path: string; content: string }[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  for (const f of files) {
    const data = enc.encode(f.content);
    parts.push(header(f.path, data.length), pad(data));
  }
  parts.push(new Uint8Array(BLOCK * 2)); // end-of-archive marker
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function header(path: string, size: number): Uint8Array {
  const h = new Uint8Array(BLOCK);
  const enc = new TextEncoder();
  const name = enc.encode(path);
  if (name.length > 100) throw new Error(`File path too long for tar: ${path}`);
  h.set(name, 0);
  h.set(enc.encode('0000644\0'), 100); // mode
  h.set(enc.encode('0000000\0'), 108); // uid
  h.set(enc.encode('0000000\0'), 116); // gid
  h.set(enc.encode(size.toString(8).padStart(11, '0') + '\0'), 124);
  h.set(enc.encode('00000000000\0'), 136); // mtime (fixed: reproducible input)
  h.fill(0x20, 148, 156); // checksum placeholder: spaces
  h[156] = 0x30; // typeflag '0' = regular file
  h.set(enc.encode('ustar\0'), 257);
  h.set(enc.encode('00'), 263);
  const sum = h.reduce((s, b) => s + b, 0);
  h.set(enc.encode(sum.toString(8).padStart(6, '0') + '\0 '), 148);
  return h;
}

function pad(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.ceil(data.length / BLOCK) * BLOCK);
  out.set(data);
  return out;
}
