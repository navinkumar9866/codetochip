import { useState, type ReactNode } from 'react';
import { ArrowRight, CircleCheck, CircleDashed, CircleX, TriangleAlert } from 'lucide-react';
import type { CompileOutcome, Diagnostic } from '../compile/client.ts';
import { explain } from './explain.ts';

/**
 * Every mistake from the last Check, one row each. The selected row opens into
 * 01 What happened · 02 Why it's wrong · 03 How to fix. Errors block upload; warnings don't.
 */
export function ProblemsPanel({
  outcome,
  stale,
  onJump,
  mustSignIn = false,
}: {
  outcome: CompileOutcome | null;
  /** The code changed since this outcome was produced. */
  stale: boolean;
  onJump: (d: Diagnostic) => void;
  /** Guests must sign in before they can check. */
  mustSignIn?: boolean;
}) {
  const [picked, setPicked] = useState(0);
  const [showLog, setShowLog] = useState(false);

  if (!outcome) {
    return (
      <Empty
        icon={<CircleDashed size={16} className="text-muted" />}
        title="Not checked yet"
        text={
          mustSignIn
            ? 'Sign in (it’s free), then press Check to look for mistakes.'
            : 'Press Check to look for mistakes. Nothing is sent to the board.'
        }
      />
    );
  }
  const problems = outcome.diagnostics.filter((d) => d.severity !== 'note');
  const sel = problems[Math.min(picked, problems.length - 1)];
  const e = sel && explain(sel);

  return (
    <div className="flex flex-col">
      {stale && (
        <p className="border-b border-line bg-warn-soft px-5 py-2 text-sm">
          You changed the code since this check. Press Check again to update the list.
        </p>
      )}
      <div className="flex flex-wrap items-stretch">
        <div className="flex max-w-full min-w-0 flex-[1_1_280px] flex-col border-line md:max-w-[340px] md:border-r">
          {problems.length === 0 ? (
            <Empty
              icon={<CircleCheck size={16} className="text-ok" />}
              title="All clear"
              text="No mistakes found. Safe to upload."
            />
          ) : (
            <ul aria-label="Problems">
              {problems.map((d, i) => (
                <li key={i}>
                  <button
                    aria-pressed={d === sel}
                    className={`flex w-full items-start gap-2.5 border-b border-line px-5 py-3 text-left ${d === sel ? 'bg-sel' : 'hover:bg-raised-2'}`}
                    onClick={() => setPicked(i)}
                  >
                    {d.severity === 'error' ? (
                      <CircleX size={16} className="mt-1 flex-none text-err" />
                    ) : (
                      <TriangleAlert size={16} className="mt-1 flex-none text-warn" />
                    )}
                    <span className="min-w-0">
                      <span className="block font-semibold break-words">{explain(d).title}</span>
                      <span className="block text-[13px] opacity-85">
                        {d.file}:{d.line}:{d.column} ·{' '}
                        {d.severity === 'error' ? 'Blocks upload' : 'Suggestion'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            className="px-5 py-2 text-left text-[13px] text-muted hover:text-ink"
            aria-expanded={showLog}
            onClick={() => setShowLog((s) => !s)}
          >
            {showLog ? 'Hide' : 'Show'} the full build log
          </button>
        </div>
        {sel && e && (
          <>
            <Step n="01" label="What happened" accent>
              <div className="text-lg leading-tight font-semibold">{e.title}</div>
              <div className="text-[15px]">{e.what}</div>
            </Step>
            <Step n="02" label="Why it’s wrong">
              <div className="text-[15px]">{e.why}</div>
            </Step>
            <Step n="03" label="How to fix" last>
              <div className="text-[15px]">{e.how}</div>
              <button className="btn btn-primary self-start" onClick={() => onJump(sel)}>
                Go to {sel.file} line {sel.line}
                <ArrowRight size={16} />
              </button>
            </Step>
          </>
        )}
      </div>
      {showLog && (
        <pre className="max-h-60 overflow-auto border-t border-line bg-panel px-5 py-3 font-mono text-xs whitespace-pre-wrap">
          {outcome.log || (outcome.ok ? 'Build succeeded.' : '')}
          {outcome.cached ? '\n(Reused an identical recent build.)' : ''}
        </pre>
      )}
    </div>
  );
}

function Empty({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex items-center gap-2.5 px-5 py-4">
      {icon}
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-sm text-muted">{text}</div>
      </div>
    </div>
  );
}

function Step({
  n,
  label,
  accent,
  last,
  children,
}: {
  n: string;
  label: string;
  accent?: boolean;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex min-w-0 flex-[1_1_240px] flex-col gap-2 border-t border-line px-5 py-4 md:border-t-0 ${last ? '' : 'md:border-r'}`}
    >
      <div className={`kicker ${accent ? 'text-accent-ink' : ''}`}>
        {n} · {label}
      </div>
      {children}
    </div>
  );
}
