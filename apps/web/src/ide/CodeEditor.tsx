import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { basicSetup } from 'codemirror';
import { cpp } from '@codemirror/lang-cpp';
import { lintGutter, setDiagnostics, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
import { Compartment, EditorState, type Extension, type Text } from '@codemirror/state';
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
import { syntaxHighlighting } from '@codemirror/language';
import { EditorView, keymap } from '@codemirror/view';
import { indentWithTab, insertTab } from '@codemirror/commands';
import { useDisplay } from '../app/display.ts';
import type { Diagnostic } from '../compile/client.ts';

/** Lets other controls (the phone symbol toolbar) type into the editor. */
export interface EditorApi {
  /** Inserts text at the cursor; brackets and quotes get their closing pair. */
  insert(text: string): void;
  tab(): void;
  /** Moves the cursor to the start of a line (1-based) and shows it. */
  goTo(line: number): void;
}

const PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };

/** Colours come from the app theme's CSS variables, so the editor follows the theme. */
const base = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--panel)', color: 'var(--ink)' },
  '.cm-scroller': { fontSize: '0.875rem', lineHeight: '1.8', fontFamily: 'var(--font-code)' },
  '.cm-content': { caretColor: 'var(--accent)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
  '.cm-gutters': { backgroundColor: 'var(--panel)', color: 'var(--muted)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'var(--sel)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--sel)', color: 'var(--ink)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 28%, transparent)',
  },
  '.cm-tooltip': { backgroundColor: 'var(--raised)', border: '1px solid var(--line-strong)' },
});
/** One Dark's syntax colours on the dark theme; CodeMirror's default ones on light themes. */
const highlight = (theme: string): Extension =>
  theme === 'dark' ? syntaxHighlighting(oneDarkHighlightStyle) : [];

/** C/C++ editor for one file; compile diagnostics appear inline at their line and column. */
export function CodeEditor({
  value,
  onChange,
  diagnostics,
  apiRef,
  readOnly = false,
}: {
  value: string;
  onChange: (value: string) => void;
  diagnostics: Diagnostic[];
  apiRef?: RefObject<EditorApi | null>;
  readOnly?: boolean;
}) {
  const { theme } = useDisplay();
  const host = useRef<HTMLDivElement>(null);
  const [colours] = useState(() => new Compartment());
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          cpp(),
          base,
          colours.of(highlight(theme)),
          EditorState.readOnly.of(readOnly),
          lintGutter(),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    if (apiRef) {
      apiRef.current = {
        insert(text) {
          const close = PAIRS[text] ?? '';
          const { from, to } = v.state.selection.main;
          v.dispatch({
            changes: { from, to, insert: text + close },
            selection: { anchor: from + text.length },
            scrollIntoView: true,
          });
          v.focus();
        },
        tab() {
          insertTab(v);
          v.focus();
        },
        goTo(line) {
          const at = v.state.doc.line(Math.min(Math.max(1, line), v.state.doc.lines)).from;
          v.dispatch({ selection: { anchor: at }, scrollIntoView: true });
          v.focus();
        },
      };
    }
    return () => v.destroy();
    // Created once; later value changes are applied below without losing cursor or undo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    view.current!.dispatch({ effects: colours.reconfigure(highlight(theme)) });
  }, [colours, theme]);

  useEffect(() => {
    const v = view.current!;
    if (v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    const v = view.current!;
    v.dispatch(
      setDiagnostics(
        v.state,
        diagnostics.map((d) => toCm(v.state.doc, d)),
      ),
    );
  }, [diagnostics, value]);

  return <div ref={host} className="h-full min-h-64 overflow-hidden" data-testid="code-editor" />;
}

function toCm(doc: Text, d: Diagnostic): CmDiagnostic {
  const line = doc.line(Math.min(Math.max(1, d.line), doc.lines));
  // Underline from the column to the end of the line; if the column is at or past the end
  // (GCC does this), underline the whole line so the marker is always visible.
  const col = line.from + Math.max(0, d.column - 1);
  const from = col < line.to ? col : line.from;
  return {
    from,
    to: line.to,
    severity: d.severity === 'note' ? 'info' : d.severity,
    message: d.message,
  };
}
