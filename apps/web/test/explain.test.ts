import { describe, expect, it } from 'vitest';
import { explain } from '../src/ide/explain.ts';

const at = (message: string, line = 4) =>
  explain({ file: 'blink.ino', line, column: 3, severity: 'error', message });

describe('explain', () => {
  it('turns common compiler messages into plain words', () => {
    expect(at("'pinMod' was not declared in this scope").title).toBe('“pinMod” isn’t known here');
    expect(at("expected ';' before 'delay'", 7)).toMatchObject({
      title: 'A “;” is missing',
      how: 'Add “;” at the end of line 6 or line 7.',
    });
    expect(at("expected '}' at end of input").title).toBe('A closing “}” is missing');
    expect(at('Servo.h: No such file or directory').title).toBe('Can’t find “Servo.h”');
    expect(at("'Strng' does not name a type").title).toBe('“Strng” isn’t a type');
    expect(at("no matching function for call to 'digitalWrite(int)'").title).toBe(
      '“digitalWrite” called the wrong way',
    );
    expect(at("redefinition of 'void setup()'").title).toBe('“void setup()” is defined twice');
    expect(at("invalid conversion from 'const char*' to 'int'").what).toBe(
      'Line 4 gives a value of type const char* where int is needed.',
    );
  });

  it('keeps the compiler’s own words for anything else', () => {
    const e = at('something unusual');
    expect(e.title).toBe('something unusual');
    expect(e.what).toBe('blink.ino line 4: something unusual');
    expect(
      explain({ file: 'a.ino', line: 1, column: 1, severity: 'warning', message: 'x' }).why,
    ).toMatch(/may not do what you expect/);
  });
});
