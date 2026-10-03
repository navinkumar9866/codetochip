import { useId, useState } from 'react';

/**
 * The small "i" next to a term or action: hover, focus or tap it to read a plain-English
 * explanation (design rule: every non-obvious term or action has one).
 */
export function Info({
  title,
  text,
  align = 'left',
}: {
  title: string;
  text: string;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className="relative inline-flex align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`About: ${title}`}
        aria-describedby={open ? id : undefined}
        className="inline-flex size-4 cursor-help items-center justify-center rounded-full border border-line-strong text-[10px] leading-none font-semibold text-muted normal-case hover:border-accent hover:text-accent"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          className={`absolute top-[calc(100%+8px)] z-50 flex w-64 max-w-[calc(100vw-32px)] flex-col gap-1 rounded-lg border border-line bg-raised px-3.5 py-3 text-left text-[13px] leading-snug font-normal tracking-normal whitespace-normal text-ink normal-case shadow-xl ${align === 'right' ? '-right-2' : '-left-2'}`}
        >
          <span className="text-sm font-semibold">{title}</span>
          <span>{text}</span>
        </span>
      )}
    </span>
  );
}
