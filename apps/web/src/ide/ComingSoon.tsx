import { ArrowRight, GraduationCap, MonitorPlay, Rocket } from 'lucide-react';

export type IdeMode = 'learn' | 'build' | 'simulate' | 'deploy';

const SOON = {
  learn: {
    icon: GraduationCap,
    title: 'Guided lessons are on the way',
    text: 'Step-by-step lessons with blocks you snap together, and a coach that explains each mistake and fixes it with one click.',
  },
  simulate: {
    icon: MonitorPlay,
    title: 'The simulator is on the way',
    text: 'Run your program on a virtual board in the browser. No wires, and nothing can break.',
  },
  deploy: {
    icon: Rocket,
    title: 'Deploy is on the way',
    text: 'Send one program to many boards at once, with checks before anything changes.',
  },
} as const;

/** The modes the design has that aren't built yet. Says so plainly and points back to Build. */
export function ComingSoon({
  mode,
  onBuild,
}: {
  mode: Exclude<IdeMode, 'build'>;
  onBuild: () => void;
}) {
  const { icon: Icon, title, text } = SOON[mode];
  return (
    <div className="flex flex-1 items-start justify-center p-6 md:p-12">
      <div className="flex max-w-lg flex-col gap-4 rounded-xl border border-line bg-panel p-6">
        <span className="flex size-10 items-center justify-center rounded-md bg-accent-soft text-accent-ink">
          <Icon size={20} />
        </span>
        <h1 className="text-2xl leading-tight font-semibold tracking-tight">{title}</h1>
        <p className="text-[15px] text-muted">{text}</p>
        <p className="text-[15px]">
          For now, write your program in Build, press Compile to find mistakes, and Upload to send
          it to your board.
        </p>
        <button className="btn btn-primary self-start" onClick={onBuild}>
          Open Build
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
