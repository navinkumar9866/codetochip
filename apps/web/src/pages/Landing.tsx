import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  ArrowRight,
  Blocks,
  CircleAlert,
  CircleCheck,
  Cpu,
  FileCode,
  GraduationCap,
  MonitorPlay,
  Play,
  Rocket,
  RotateCcw,
  ShieldCheck,
  Stamp,
  TestTube,
} from 'lucide-react';
import { boards } from '@codetochip/boards';
import { LogoMark } from '../ui/Logo.tsx';
import './landing.css';

const APP = '/projects';
const CODE = [
  '#define LED LED_BUILTIN',
  'void setup() {',
  '  pinMode(LED, OUTPUT);',
  '}',
  'void loop() {',
  '  digitalWrite(LED, HIGH);',
  '  delay(500);',
  '  digitalWrite(LED, LOW);',
  '  delay(500);',
  '}',
];
const BLOCKS = ['Turn the LED on', 'Wait 500 ms', 'Turn the LED off', 'Wait 500 ms'];

/** The public homepage, from the "CodeToChip Homepage" design. Not-yet-built parts say so. */
export function LandingPage() {
  return (
    <div className="landing flex min-h-dvh flex-col">
      <header className="border-b-2 border-[var(--l-text)]">
        <div className="l-wrap flex flex-wrap items-center gap-x-8 gap-y-3 py-4">
          <Link
            to="/"
            aria-label="CodeToChip home"
            className="l-plain flex items-center gap-2.5 text-[var(--l-text)] no-underline"
          >
            <LogoMark size={32} />
            <Wordmark size={22} />
          </Link>
          <nav
            aria-label="Main"
            className="flex flex-1 flex-wrap gap-x-6 gap-y-1 text-[15px] font-semibold"
          >
            {(
              [
                ['#how', 'How it works'],
                ['#boards', 'Boards'],
                ['#errors', 'Errors'],
                ['#safe', 'Deploy'],
              ] as const
            ).map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="l-plain text-[var(--l-text)] no-underline hover:text-[var(--l-accent)]"
              >
                {label}
              </a>
            ))}
          </nav>
          <Link to={APP} className="l-btn l-btn-primary">
            Open the app
            <ArrowRight size={16} />
          </Link>
        </div>
      </header>

      <main id="top" className="flex-1">
        <section className="l-wrap grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] items-center gap-14 py-[clamp(48px,8vw,112px)]">
          <div className="flex flex-col gap-7">
            <h1 className="m-0 -ml-[0.05em] flex flex-col text-[clamp(44px,6.2vw,84px)] leading-[1.04] font-extrabold tracking-[-0.025em]">
              <span>Write it.</span>
              <span>Test it.</span>
              <span className="text-[var(--l-accent)]">Put it on the chip.</span>
            </h1>
            <p className="m-0 max-w-[52ch] text-lg leading-relaxed">
              CodeToChip takes you from your first blinking LED to code running on a real board.
              Write C in your browser, upload it over USB, and get every error explained in plain
              English. Blocks and a virtual board are coming soon.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to={APP} className="l-btn l-btn-primary min-w-60">
                Start your first project
                <ArrowRight size={16} />
              </Link>
              <a href="#how" className="l-btn l-btn-ghost">
                See how it works
              </a>
            </div>
            <div className="text-[13px] font-semibold tracking-[0.06em] text-[var(--l-muted)] uppercase">
              Free · Runs in your browser · Nothing to install
            </div>
          </div>
          <Demo />
        </section>

        <section id="boards" className="border-y-2 border-[var(--l-text)]">
          <div className="l-wrap grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
            <div className="flex flex-col justify-center gap-1 py-6 pr-6">
              <span className="l-kicker">Works with</span>
              <span className="text-[15px] text-[var(--l-muted)]">
                Pick your board. Each one comes with its own setup steps and examples.
              </span>
            </div>
            {boards.map((b) => (
              <BoardCell
                key={b.id}
                name={b.name}
                detail={`${b.vendor} · ${b.arch.toUpperCase()}`}
              />
            ))}
            <BoardCell name="More boards" detail="On the way" muted />
          </div>
        </section>

        <section id="how" className="l-wrap flex flex-col gap-8 py-[clamp(56px,7vw,96px)]">
          <div className="flex flex-col gap-3">
            <span className="l-kicker">Four modes, one project</span>
            <h2 className="l-h2 max-w-[20ch]">
              Grow from blocks to production without switching tools.
            </h2>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-10">
            <Mode n="01" icon={<GraduationCap size={22} />} title="Learn" soon>
              Five guided steps from “plug it in” to “it’s running.” One next step on screen at a
              time, always with the why.
            </Mode>
            <Mode n="02" icon={<Blocks size={22} />} title="Build">
              A real C editor with your files, examples and a serial monitor. Blocks that write the
              C for you are coming soon.
            </Mode>
            <Mode n="03" icon={<MonitorPlay size={22} />} title="Simulate" soon>
              Run it on a virtual board first. Watch the pins, slide a fake sensor, and read what’s
              happening in a sentence.
            </Mode>
            <Mode n="04" icon={<Rocket size={22} />} title="Deploy">
              Upload over USB straight from the browser, on a computer or an Android phone. Rolling
              firmware out to many devices is coming soon.
            </Mode>
          </div>
        </section>

        <ErrorsSection />

        <section id="safe" className="l-rule">
          <div className="l-wrap flex flex-col gap-8 py-[clamp(56px,7vw,96px)]">
            <div className="flex flex-col gap-3">
              <span className="l-kicker">Built for the floor, too</span>
              <h2 className="l-h2 max-w-[22ch]">Nothing reaches a machine until it’s ready.</h2>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-10">
              <Safeguard icon={<ShieldCheck size={22} />} title="Checked">
                Upload stays locked until compiling finds zero errors.
              </Safeguard>
              <Safeguard icon={<TestTube size={22} />} title="Tested on hardware" soon>
                A hardware-in-the-loop run must pass before a rollout starts.
              </Safeguard>
              <Safeguard icon={<Stamp size={22} />} title="Approved" soon>
                Someone signs off. Any edit after that resets the approval.
              </Safeguard>
            </div>
          </div>
        </section>

        <section className="bg-[var(--l-accent)] text-[var(--l-bg)]">
          <div className="l-wrap flex flex-col gap-9 py-[clamp(56px,7vw,96px)]">
            <h2 className="m-0 -ml-[0.05em] flex flex-col text-[clamp(36px,4.6vw,64px)] leading-[1.04] font-extrabold tracking-[-0.02em]">
              <span>From first blink</span>
              <span>to the factory floor.</span>
            </h2>
            <div>
              <Link to={APP} className="l-btn l-btn-outline min-w-60">
                Start a project
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="l-wrap flex w-full flex-wrap items-center gap-x-8 gap-y-3 py-7 text-[13px] text-[var(--l-muted)]">
        <span className="text-[var(--l-text)]">
          <Wordmark size={16} />
        </span>
        <span className="flex flex-1 flex-wrap gap-x-4 gap-y-1">
          <span>© 2026 CodeToChip</span>
          <span>Open source</span>
          <span>Made in India</span>
        </span>
        <a href="#how">How it works</a>
        <a href="#boards">Boards</a>
        <Link to={APP}>Open the app</Link>
      </footer>
    </div>
  );
}

function Wordmark({ size }: { size: number }) {
  return (
    <span className="leading-none font-bold tracking-[-0.02em]" style={{ fontSize: size }}>
      Code<span className="text-[var(--l-accent)]">To</span>Chip
    </span>
  );
}

function Soon() {
  return <span className="l-tag l-tag-neutral">Coming soon</span>;
}

/** The hero's moving preview: blocks and C side by side, stepping through the blink loop. */
function Demo() {
  const [phase, setPhase] = useState(0);
  const [still] = useState(
    () =>
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    if (still) return;
    const t = setInterval(() => setPhase((p) => (p + 1) % 4), 600);
    return () => clearInterval(t);
  }, [still]);
  const on = phase < 2;
  return (
    <div
      aria-label="Preview of a blink program"
      className="flex min-w-0 flex-col border-2 border-[var(--l-text)] bg-[var(--l-surface)]"
    >
      <div className="flex items-center gap-3 border-b-2 border-[var(--l-text)] px-4 py-2.5 text-[13px] font-semibold">
        <FileCode size={16} />
        <span className="l-mono">blink.ino</span>
        <span className="truncate text-[var(--l-muted)]">{boards[0]?.name}</span>
        <span className="flex-1" />
        <span className="l-tag l-tag-accent">
          <Play size={12} />
          Preview
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <div className="flex flex-col gap-1.5 border-r-2 border-[var(--l-divider)] p-4">
          <div className="l-label mb-1 flex items-center gap-2">
            Blocks <Soon />
          </div>
          <div className="bg-[var(--l-text)] px-3 py-2 text-sm font-bold text-[var(--l-bg)]">
            Forever
          </div>
          {BLOCKS.map((label, i) => {
            const active = !still && i === phase;
            return (
              <div
                key={i}
                className="ml-4 border-2 px-3 py-2 text-sm font-semibold"
                style={{
                  borderColor: active ? 'var(--l-accent)' : 'var(--l-divider)',
                  background: active ? 'var(--l-accent-100)' : 'var(--l-bg)',
                  color: active ? 'var(--l-accent-800)' : 'var(--l-text)',
                }}
              >
                {label}
              </div>
            );
          })}
        </div>
        <div className="flex min-w-0 flex-col overflow-x-auto py-4">
          <div className="l-label mx-4 mb-2">C code</div>
          {CODE.map((text, i) => (
            <div
              key={i}
              className="l-mono flex gap-3 px-4 text-[13px] leading-[1.8] whitespace-pre"
              style={{ background: !still && i === phase + 5 ? 'var(--l-accent-100)' : undefined }}
            >
              <span className="w-3.5 flex-none text-right text-[var(--l-faint)]">{i + 1}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-4 border-t-2 border-[var(--l-text)] px-4 py-3.5">
        <div
          className="size-11 flex-none border-2 border-[var(--l-text)]"
          style={{ background: on ? 'var(--l-accent)' : 'var(--l-bg)' }}
        />
        <div className="flex flex-col gap-0.5">
          <span className="l-label flex items-center gap-2">
            Virtual board · LED <Soon />
          </span>
          <span className="text-[15px] font-semibold">
            {on ? 'The LED is on.' : 'The LED is off.'}
          </span>
        </div>
      </div>
    </div>
  );
}

function BoardCell({ name, detail, muted }: { name: string; detail: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-3.5 border-l-2 border-[var(--l-divider)] p-6">
      <Cpu size={24} className={muted ? 'text-[var(--l-faint)]' : 'text-[var(--l-accent)]'} />
      <div className="flex flex-col gap-0.5">
        <b className="text-[17px]">{name}</b>
        <span className="text-[13px] text-[var(--l-muted)]">{detail}</span>
      </div>
    </div>
  );
}

function Mode({
  n,
  icon,
  title,
  soon,
  children,
}: {
  n: string;
  icon: ReactNode;
  title: string;
  soon?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="l-rule flex flex-col gap-3.5 pt-6">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-extrabold">{n}</span>
        <span className="text-[var(--l-accent)]">{icon}</span>
      </div>
      <h3 className="m-0 flex items-center gap-3 text-2xl font-extrabold tracking-[-0.01em]">
        {title}
        {soon && <Soon />}
      </h3>
      <p className="m-0 text-[15.5px] leading-relaxed">{children}</p>
    </div>
  );
}

function Safeguard({
  icon,
  title,
  soon,
  children,
}: {
  icon: ReactNode;
  title: string;
  soon?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="l-rule flex flex-col gap-2.5 pt-6">
      <span className="text-[var(--l-accent)]">{icon}</span>
      <b className="flex items-center gap-3 text-[19px]">
        {title}
        {soon && <Soon />}
      </b>
      <span className="text-[15.5px] leading-relaxed">{children}</span>
    </div>
  );
}

/** A real example of how the Problems panel explains a compiler error. */
function ErrorsSection() {
  const [fixed, setFixed] = useState(false);
  return (
    <section id="errors" className="l-rule">
      <div className="l-wrap grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-start gap-14 py-[clamp(56px,7vw,96px)]">
        <div className="flex flex-col gap-5">
          <span className="l-kicker">Errors, explained</span>
          <h2 className="l-h2">No cryptic compiler output.</h2>
          <p className="m-0 max-w-[46ch] text-[17px] leading-relaxed">
            Every problem comes in three parts: what happened, why it’s wrong, and how to fix it,
            with a button that takes you straight to the line. Errors block the upload; suggestions
            never do.
          </p>
        </div>
        <div className="border-2 border-[var(--l-text)] bg-[var(--l-surface)]">
          <div
            className="flex items-center gap-3 border-b-2 border-[var(--l-text)] px-4 py-3"
            style={{ background: fixed ? 'var(--l-surface)' : 'var(--l-accent-100)' }}
          >
            {fixed ? (
              <CircleCheck size={18} />
            ) : (
              <CircleAlert size={18} className="text-[var(--l-accent)]" />
            )}
            <b className="flex-1 text-[15px]">
              {fixed ? 'Fixed: no errors' : '“pinMod” isn’t known here'}
            </b>
            <span className="text-[13px] text-[var(--l-muted)]">Line 2</span>
            <span className={`l-tag ${fixed ? 'l-tag-neutral' : 'l-tag-accent'}`}>
              {fixed ? 'Ready' : 'Error'}
            </span>
          </div>
          {fixed ? (
            <div className="flex flex-wrap items-center gap-4 px-4 py-5">
              <span className="min-w-[200px] flex-1 text-[15px] leading-normal">
                pinMode is spelled right now. Zero errors: you’re clear to upload.
              </span>
              <button type="button" className="l-btn l-btn-ghost" onClick={() => setFixed(false)}>
                <RotateCcw size={16} />
                Show the error again
              </button>
            </div>
          ) : (
            <div className="flex flex-col">
              <Part n="01" label="What happened">
                Line 2 uses “pinMod”, but nothing with that exact name exists.
              </Part>
              <Part n="02" label="Why it’s wrong">
                C++ only knows names spelled exactly as they were declared, capitals included.
              </Part>
              <Part n="03" label="How to fix" last>
                <div className="l-mono border-2 border-[var(--l-divider)] bg-[var(--l-bg)] text-[13px] leading-[1.8]">
                  <div className="bg-[var(--l-accent-100)] px-3 whitespace-pre text-[var(--l-accent-800)]">
                    - pinMod(LED, OUTPUT);
                  </div>
                  <div className="px-3 whitespace-pre">+ pinMode(LED, OUTPUT);</div>
                </div>
                <div>
                  <button
                    type="button"
                    className="l-btn l-btn-primary"
                    onClick={() => setFixed(true)}
                  >
                    Try the fix
                    <CircleCheck size={16} />
                  </button>
                </div>
              </Part>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Part({
  n,
  label,
  last,
  children,
}: {
  n: string;
  label: string;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`grid grid-cols-[40px_minmax(0,1fr)] gap-3 p-4 ${last ? '' : 'border-b-2 border-[var(--l-divider)]'}`}
    >
      <b className="text-[13px]">{n}</b>
      <div className="flex min-w-0 flex-col gap-2.5">
        <span className="l-label">{label}</span>
        <div className="text-[15px] leading-normal">{children}</div>
      </div>
    </div>
  );
}
