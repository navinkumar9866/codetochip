import type { ProjectFile } from '@codetochip/data';

/** Examples bundled with the app (work offline, for every board with an LED and serial). */
export const builtinExamples: {
  id: string;
  title: string;
  description: string;
  files: ProjectFile[];
}[] = [
  {
    id: 'builtin-blink',
    title: 'Blink',
    description: 'Blinks the on-board LED once a second.',
    files: [
      {
        path: 'blink.ino',
        content: `// Blinks the on-board LED once a second.
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  delay(500);
}
`,
      },
    ],
  },
  {
    id: 'builtin-hello-serial',
    title: 'Hello, serial',
    description: 'Prints a counter every second. Open the serial monitor to see it.',
    files: [
      {
        path: 'hello.ino',
        content: `// Prints a counter every second. Open the serial monitor to see it.
unsigned long count = 0;

void setup() {
  Serial.begin(115200);
}

void loop() {
  Serial.print("Hello from CodeToChip ");
  Serial.println(count++);
  delay(1000);
}
`,
      },
    ],
  },
];

export const starterFiles = (): ProjectFile[] => [
  {
    path: 'sketch.ino',
    content: 'void setup() {\n  // runs once\n}\n\nvoid loop() {\n  // runs forever\n}\n',
  },
];
