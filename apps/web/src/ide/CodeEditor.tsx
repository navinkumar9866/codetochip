import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { basicSetup } from 'codemirror';
import { cpp } from '@codemirror/lang-cpp';
import { lintGutter, setDiagnostics, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
import { EditorState, type Text } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, keymap } from '@codemirror/view';
import { indentWithTab, insertTab } from '@codemirror/commands';
import type { Diagnostic } from '../compile/client.ts';

/** Lets other controls (the phone symbol toolbar) type into the editor. */
export interface EditorApi {
  /** Inserts text at the cursor; brackets and quotes get their closing pair. */
  insert(text: string): void;
  tab(): void;
}

const PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };

/** C/C++ editor for one file; compile diagnostics appear inline at their line and column. */
export function CodeEditor({
  value,
  onChange,
  diagnostics,
  apiRef,
}: {
  value: string;
  onChange: (value: string) => void;
  diagnostics: Diagnostic[];
  apiRef?: RefObject<EditorApi | null>;
}) {
  const host = useRef<HTMLDivElement>(null);
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
          oneDark,
          lintGutter(),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
          EditorView.theme({ '&': { height: '100%' }, '.cm-scroller': { fontSize: '14px' } }),
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
      };
    }
    return () => v.destroy();
    // Created once; later value changes are applied below without losing cursor or undo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
