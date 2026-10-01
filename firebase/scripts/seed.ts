// Fills the local emulators with test users and demo content. Refuses to run against
// a real project. Usage: pnpm seed (with `pnpm dev` or `pnpm emulators` running).
import type { Example, Lesson, Page, Role, SiteSettings } from '@codetochip/data';
import { COLLECTIONS } from '@codetochip/data';
import { initAdmin } from './admin.ts';

const { auth, db, projectId } = initAdmin();
if (!projectId.startsWith('demo-')) {
  console.error(`Refusing to seed real project "${projectId}". Seeding is for the emulators only.`);
  process.exit(1);
}

const PASSWORD = 'password';
const users: { email: string; name: string; role: Role }[] = [
  { email: 'admin@example.com', name: 'Ada Admin', role: 'admin' },
  { email: 'editor@example.com', name: 'Eddie Editor', role: 'editor' },
  { email: 'student@example.com', name: 'Sam Student', role: 'student' },
];

for (const u of users) {
  const existing = await auth.getUserByEmail(u.email).catch(() => null);
  const user =
    existing ??
    (await auth.createUser({ email: u.email, password: PASSWORD, displayName: u.name }));
  await auth.setCustomUserClaims(user.uid, { role: u.role });
}

const hello: Example = {
  title: 'Hello, serial',
  description: 'Prints a message every second. Open the serial monitor to see it.',
  boardIds: [],
  files: [
    {
      path: 'hello.ino',
      content:
        'void setup() {\n  Serial.begin(115200);\n}\n\nvoid loop() {\n  Serial.println("Hello from CodeToChip");\n  delay(1000);\n}\n',
    },
  ],
  published: true,
  order: 1,
};
const lesson: Lesson = {
  title: 'Your first program',
  slug: 'first-program',
  body: '# Your first program\n\nDemo lesson content. Edit me in the admin.',
  boardIds: [],
  published: true,
  order: 1,
};
const draft: Lesson = {
  ...lesson,
  title: 'Draft lesson',
  slug: 'draft',
  published: false,
  order: 2,
};
const about: Page = { title: 'About', body: 'CodeToChip is open source.', published: true };
const settings: SiteSettings = { announcement: '', maintenanceMode: false };

const batch = db.batch();
batch.set(db.doc(`${COLLECTIONS.examples}/hello-serial`), hello);
batch.set(db.doc(`${COLLECTIONS.lessons}/first-program`), lesson);
batch.set(db.doc(`${COLLECTIONS.lessons}/draft`), draft);
batch.set(db.doc(`${COLLECTIONS.pages}/about`), about);
batch.set(db.doc(`${COLLECTIONS.settings}/site`), settings);
await batch.commit();

console.log(`Seeded ${projectId}. Test users (password "${PASSWORD}"):`);
for (const u of users) console.log(`  ${u.role.padEnd(8)} ${u.email}`);
