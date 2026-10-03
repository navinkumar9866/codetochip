import type { Diagnostic } from '../compile/client.ts';

/** A compiler message in plain words: the Problems panel's "What / Why / How to fix". */
export interface Explanation {
  title: string;
  what: string;
  why: string;
  how: string;
}

type Rule = (m: RegExpMatchArray, d: Diagnostic) => Explanation;

/** Common GCC (C/C++) messages beginners hit. Anything else falls back to the raw message. */
const RULES: [RegExp, Rule][] = [
  [
    /^'([^']+)' was not declared in this scope/,
    ([, name], d) => ({
      title: `“${name}” isn’t known here`,
      what: `Line ${d.line} uses “${name}”, but nothing with that exact name exists at that point.`,
      why: 'C++ only knows names spelled exactly as they were declared, capitals included, and declared before they are used. Names from a library also need that library’s #include at the top.',
      how: `Check the spelling of “${name}” on line ${d.line}. If it comes from a library, add its #include at the top of the file.`,
    }),
  ],
  [
    /^expected '([;,)\]}])' before/,
    ([, ch], d) => ({
      title: `A “${ch}” is missing`,
      what: `The compiler expected “${ch}” around line ${d.line}.`,
      why:
        ch === ';'
          ? 'Every statement in C++ ends with a semicolon. The compiler only notices when it reaches the next line, so the mistake is often at the end of the line above.'
          : 'Brackets and separators have to come in the right places. The compiler only notices at the next piece of code, so the mistake is often just before it.',
      how: `Add “${ch}” at the end of line ${Math.max(1, d.line - 1)} or line ${d.line}.`,
    }),
  ],
  [
    /^expected '}' at end of input/,
    (_m, d) => ({
      title: 'A closing “}” is missing',
      what: `The file ended (line ${d.line}) while a block was still open.`,
      why: 'Every “{” needs a matching “}”. Without it, the compiler reaches the end of the file still inside a function or loop.',
      how: 'Find the block that isn’t closed (your editor highlights matching brackets) and add “}” where it should end.',
    }),
  ],
  [
    /^([^:]+): No such file or directory/,
    ([, file], d) => ({
      title: `Can’t find “${file}”`,
      what: `Line ${d.line} includes “${file}”, but there is no file or library with that name.`,
      why: 'An #include only works for a file in your project or a library installed for this board.',
      how: `Check the spelling of “${file}”. If it is a library, it may not be available for this board yet.`,
    }),
  ],
  [
    /^'([^']+)' does not name a type/,
    ([, name], d) => ({
      title: `“${name}” isn’t a type`,
      what: `Line ${d.line} uses “${name}” where a type such as int or a class name should be.`,
      why: 'Either the name is misspelled, or it comes from a library whose #include is missing. Code outside a function is also only allowed to declare things, not run them.',
      how: `Check the spelling of “${name}” and the #include lines. If it is a statement, move it inside setup() or loop().`,
    }),
  ],
  [
    /^no matching function for call to '([^'(]+)/,
    ([, fn], d) => ({
      title: `“${fn}” called the wrong way`,
      what: `Line ${d.line} calls ${fn}() with arguments it doesn’t accept.`,
      why: 'A function only accepts the number and kinds of values it was written for.',
      how: `Check how many values you pass to ${fn}() on line ${d.line}, and their types.`,
    }),
  ],
  [
    /^redefinition of '([^']+)'/,
    ([, name], d) => ({
      title: `“${name}” is defined twice`,
      what: `Line ${d.line} defines “${name}”, which already exists.`,
      why: 'Each function or variable can only be defined once. Copying in a second setup() or loop() is a common cause.',
      how: `Remove or rename one of the two definitions of “${name}”.`,
    }),
  ],
  [
    /^invalid conversion from '([^']+)' to '([^']+)'/,
    ([, from, to], d) => ({
      title: 'Wrong kind of value',
      what: `Line ${d.line} gives a value of type ${from} where ${to} is needed.`,
      why: 'C++ checks that values have the right type, and won’t turn one into an unrelated one by itself.',
      how: `Change the value on line ${d.line} so it is of type ${to}, or change the type it is stored in.`,
    }),
  ],
];

export function explain(d: Diagnostic): Explanation {
  for (const [re, rule] of RULES) {
    const m = d.message.match(re);
    if (m) return rule(m, d);
  }
  return {
    title: d.message,
    what: `${d.file} line ${d.line}: ${d.message}`,
    why:
      d.severity === 'error'
        ? 'The compiler couldn’t understand this part of the program, so it can’t be built.'
        : 'This builds, but it may not do what you expect.',
    how: `Look at line ${d.line} and the line above it; the mistake is usually there.`,
  };
}
