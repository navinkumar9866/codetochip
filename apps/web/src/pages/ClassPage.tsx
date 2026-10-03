import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { Assignment, ClassInfo, ClassMember, Project, Submission } from '@codetochip/data';
import { builtinExamples, starterFiles } from '../examples/builtin.ts';
import { CodeEditor } from '../ide/CodeEditor.tsx';
import { useCurrentUser, useServices } from '../services.tsx';

export function ClassPage() {
  const { classId = '' } = useParams();
  const { classroom } = useServices();
  const user = useCurrentUser();
  const [cls, setCls] = useState<ClassInfo | null | undefined>(undefined);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const c = await classroom.getClass(classId);
        const list = c ? await classroom.assignments(classId) : [];
        if (cancelled) return;
        setCls(c);
        setAssignments(list);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classroom, classId, user, version]);

  if (cls === undefined) return <p className="p-4 text-muted">Loading…</p>;
  if (cls === null) {
    return (
      <p role="alert" className="p-4 text-err-ink">
        This class doesn’t exist, or you haven’t joined it. Ask your teacher for the class code.
      </p>
    );
  }
  const teacher = cls.ownerId === user?.uid;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold">{cls.name}</h1>
        <p className="text-sm text-muted">Teacher: {cls.ownerName}</p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-err-ink">
          {error}
        </p>
      )}
      {teacher ? (
        <TeacherView
          cls={cls}
          assignments={assignments}
          onChanged={() => setVersion((v) => v + 1)}
          onError={setError}
        />
      ) : (
        <StudentView cls={cls} assignments={assignments} onError={setError} />
      )}
    </div>
  );
}

function TeacherView({
  cls,
  assignments,
  onChanged,
  onError,
}: {
  cls: ClassInfo;
  assignments: Assignment[];
  onChanged: () => void;
  onError: (e: string) => void;
}) {
  const { classroom, projects } = useServices();
  const [members, setMembers] = useState<ClassMember[]>([]);
  const [mine, setMine] = useState<Project[]>([]);
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [starter, setStarter] = useState('blank');

  useEffect(() => {
    let cancelled = false;
    void Promise.all([classroom.members(cls.id), projects.listMine()]).then(([m, p]) => {
      if (cancelled) return;
      setMembers(m);
      setMine(p);
    });
    return () => {
      cancelled = true;
    };
  }, [classroom, projects, cls.id]);

  const create = async () => {
    const files =
      mine.find((p) => p.id === starter)?.files ??
      builtinExamples.find((e) => e.id === starter)?.files ??
      starterFiles();
    try {
      await classroom.createAssignment(cls.id, {
        title,
        instructions,
        boardId: cls.boardId,
        files,
      });
      setTitle('');
      setInstructions('');
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <section className="rounded-lg border border-accent bg-accent-soft p-4">
        <p className="text-sm text-ink">Students join at CodeToChip → Classes with this code:</p>
        <p className="mt-1 font-mono text-3xl tracking-[0.3em]" aria-label="Join code">
          {cls.joinCode}
        </p>
      </section>

      <section>
        <h2 className="text-lg font-medium">Students ({members.length})</h2>
        <p className="mt-1 text-sm text-muted">
          {members.length ? members.map((m) => m.displayName).join(', ') : 'Nobody has joined yet.'}
        </p>
      </section>

      <section>
        <h2 className="text-lg font-medium">New assignment</h2>
        <form
          className="mt-2 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <input
            aria-label="Assignment title"
            placeholder="Title, e.g. Blink the LED"
            className="w-full rounded bg-raised-2 px-3 py-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            aria-label="Instructions"
            placeholder="What should students do?"
            className="h-24 w-full rounded bg-raised-2 px-3 py-2"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
          <label className="block text-sm text-muted">
            Starter code
            <select
              className="mt-1 block rounded bg-raised-2 px-2 py-1.5 text-ink"
              value={starter}
              onChange={(e) => setStarter(e.target.value)}
            >
              <option value="blank">Blank sketch</option>
              {builtinExamples.map((e) => (
                <option key={e.id} value={e.id}>
                  Example: {e.title}
                </option>
              ))}
              {mine.map((p) => (
                <option key={p.id} value={p.id}>
                  My project: {p.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="rounded bg-accent px-4 py-2 font-medium text-on-accent disabled:opacity-40"
            disabled={!title.trim()}
          >
            Post assignment
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-medium">Assignments</h2>
        <ul className="mt-2 space-y-3">
          {assignments.map((a) => (
            <TeacherAssignment key={a.id} cls={cls} assignment={a} members={members} />
          ))}
        </ul>
      </section>
    </>
  );
}

function TeacherAssignment({
  cls,
  assignment,
  members,
}: {
  cls: ClassInfo;
  assignment: Assignment;
  members: ClassMember[];
}) {
  const { classroom } = useServices();
  const [subs, setSubs] = useState<Submission[] | null>(null);
  const [viewing, setViewing] = useState<Submission | null>(null);

  return (
    <li className="rounded-lg border border-line p-3">
      <div className="flex items-center gap-2">
        <span className="font-medium">{assignment.title}</span>
        <button
          className="ml-auto text-sm text-accent-ink"
          onClick={() => void classroom.submissions(cls.id, assignment.id).then(setSubs)}
        >
          {subs ? 'Refresh submissions' : 'Show submissions'}
        </button>
      </div>
      {subs && (
        <div className="mt-2 text-sm">
          <p className="text-muted">
            {subs.length} of {members.length} submitted
          </p>
          <ul className="mt-1 space-y-1">
            {subs.map((s) => (
              <li key={s.uid}>
                <button className="hover:underline" onClick={() => setViewing(s)}>
                  {s.displayName}
                </button>{' '}
                <span className="text-muted">{s.submittedAt.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {viewing && (
        <div
          role="dialog"
          aria-label={`${viewing.displayName}’s submission`}
          className="mt-3 rounded border border-line-strong"
        >
          <div className="flex items-center border-b border-line-strong px-2 py-1 text-sm">
            <span>
              {viewing.displayName} · {viewing.files[0]?.path}
            </span>
            <button className="ml-auto text-muted" onClick={() => setViewing(null)}>
              Close
            </button>
          </div>
          <div className="h-72">
            <CodeEditor
              value={viewing.files[0]?.content ?? ''}
              onChange={() => {}}
              diagnostics={[]}
              readOnly
            />
          </div>
        </div>
      )}
    </li>
  );
}

function StudentView({
  cls,
  assignments,
  onError,
}: {
  cls: ClassInfo;
  assignments: Assignment[];
  onError: (e: string) => void;
}) {
  const { auth, projects, classroom } = useServices();
  const navigate = useNavigate();
  const [mine, setMine] = useState<Project[]>([]);
  const [submitted, setSubmitted] = useState<Record<string, Submission | null>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await projects.listMine();
      const subs = await Promise.all(assignments.map((a) => classroom.mySubmission(cls.id, a.id)));
      if (cancelled) return;
      setMine(list);
      setSubmitted(Object.fromEntries(assignments.map((a, i) => [a.id, subs[i] ?? null])));
    })();
    return () => {
      cancelled = true;
    };
  }, [projects, classroom, assignments, cls.id]);

  const start = async (a: Assignment) => {
    const existing = mine.find(
      (p) => p.assignment?.classId === cls.id && p.assignment.assignmentId === a.id,
    );
    if (existing) return navigate(`/ide/${existing.id}`);
    try {
      await auth.ensureUser();
      const p = await projects.create({
        name: a.title.slice(0, 100),
        boardId: a.boardId,
        files: a.files.length ? a.files : starterFiles(),
        assignment: { classId: cls.id, assignmentId: a.id },
      });
      navigate(`/ide/${p.id}`);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section>
      <h2 className="text-lg font-medium">Assignments</h2>
      {assignments.length === 0 && <p className="mt-2 text-sm text-muted">No assignments yet.</p>}
      <ul className="mt-2 space-y-3">
        {assignments.map((a) => {
          const started = mine.some(
            (p) => p.assignment?.classId === cls.id && p.assignment.assignmentId === a.id,
          );
          const sub = submitted[a.id];
          return (
            <li key={a.id} className="rounded-lg border border-line p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{a.title}</div>
                  {a.instructions && (
                    <p className="mt-1 text-sm whitespace-pre-wrap text-ink">{a.instructions}</p>
                  )}
                  <p className="mt-1 text-xs text-muted">
                    {sub ? `Submitted ${sub.submittedAt.toLocaleString()}` : 'Not submitted yet'}
                  </p>
                </div>
                <button
                  className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-on-accent"
                  onClick={() => void start(a)}
                >
                  {started ? 'Continue' : 'Start'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
