import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { boards } from '@codetochip/boards';
import { signInWithGoogleKeepingWork, type ClassInfo } from '@codetochip/data';
import { useCurrentUser, useServices } from '../services.tsx';

export function ClassesPage() {
  const services = useServices();
  const { classroom } = services;
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [teaching, setTeaching] = useState<ClassInfo[]>([]);
  const [joined, setJoined] = useState<ClassInfo[]>([]);
  const [code, setCode] = useState('');
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isTeacher = user?.role === 'teacher' || user?.role === 'admin';
  const named = !!user && !user.isAnonymous;

  useEffect(() => {
    if (!named) return;
    let cancelled = false;
    void Promise.all([
      isTeacher ? classroom.teachingClasses() : Promise.resolve([]),
      classroom.joinedClasses(),
    ]).then(
      ([t, j]) => {
        if (cancelled) return;
        setTeaching(t);
        setJoined(j);
      },
      (e: Error) => !cancelled && setError(e.message),
    );
    return () => {
      cancelled = true;
    };
  }, [classroom, named, isTeacher]);

  const run = async (action: () => Promise<ClassInfo>) => {
    setError(null);
    try {
      const c = await action();
      navigate(`/classes/${c.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8">
      <h1 className="text-2xl font-semibold">Classes</h1>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      {!named ? (
        <section className="rounded-lg border border-slate-800 p-4">
          <p className="text-slate-300">
            Sign in with Google to join a class, so your teacher can see who you are.
          </p>
          <button
            className="mt-3 rounded-md bg-sky-600 px-3 py-1.5 font-medium text-white"
            onClick={() =>
              void signInWithGoogleKeepingWork(services).catch((e: Error) => setError(e.message))
            }
          >
            Sign in with Google
          </button>
        </section>
      ) : (
        <>
          <section>
            <h2 className="text-lg font-medium">Join a class</h2>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => classroom.joinClass(code));
              }}
            >
              <input
                aria-label="Class code"
                placeholder="Code from your teacher"
                className="w-48 rounded bg-slate-800 px-3 py-2 font-mono tracking-widest uppercase"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <button
                className="rounded bg-sky-600 px-4 py-2 font-medium text-white disabled:opacity-40"
                disabled={!code.trim()}
              >
                Join
              </button>
            </form>
          </section>

          <ClassList
            title="Classes you’re in"
            classes={joined}
            empty="You haven’t joined a class yet."
          />

          {isTeacher && (
            <>
              <ClassList
                title="Classes you teach"
                classes={teaching}
                empty="You haven’t created a class yet."
              />
              <section>
                <h2 className="text-lg font-medium">New class</h2>
                <form
                  className="mt-2 flex flex-wrap gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(() =>
                      classroom.createClass({ name: newName, boardId: boards[0]!.id }),
                    );
                  }}
                >
                  <input
                    aria-label="Class name"
                    placeholder="e.g. Grade 9 Robotics"
                    className="min-w-0 flex-1 rounded bg-slate-800 px-3 py-2"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                  <button
                    className="rounded bg-slate-700 px-4 py-2 font-medium disabled:opacity-40"
                    disabled={!newName.trim()}
                  >
                    Create class
                  </button>
                </form>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ClassList({
  title,
  classes,
  empty,
}: {
  title: string;
  classes: ClassInfo[];
  empty: string;
}) {
  return (
    <section>
      <h2 className="text-lg font-medium">{title}</h2>
      {classes.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {classes.map((c) => (
            <li key={c.id}>
              <Link
                to={`/classes/${c.id}`}
                className="block rounded-lg border border-slate-800 p-3 hover:border-slate-600"
              >
                <span className="font-medium">{c.name}</span>
                <span className="ml-2 text-sm text-slate-400">· {c.ownerName}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
