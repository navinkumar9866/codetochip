// The Phase 3 flow without hardware: open example → compile → flash → serial output.
// ?services=memory&device=mock (dev builds only) swap Firebase and the USB board for
// in-memory accounts and the simulated VEGA bootloader built from Gate 0 recordings.
// The compile API is faked here so CI needs no Docker; services/compiler has its own tests.
import { expect, test, type Page } from '@playwright/test';

const MOCK = 'services=memory&device=mock';

/** Phones show one view at a time; open it from the bottom bar if there is one. */
async function openView(page: Page, name: 'Code' | 'Problems' | 'Serial') {
  const bar = page.getByRole('navigation', { name: 'Editor' });
  if (await bar.isVisible()) await bar.getByRole('button', { name, exact: true }).click();
}

async function fakeCompiler(page: Page, outcome: object, binary = new Uint8Array(4396).fill(0x13)) {
  const { artifact, ...rest } = outcome as { artifact?: object };
  await page.route('**/api/build', (route) =>
    route.fulfill({
      json: {
        ...rest,
        ...(artifact && {
          artifact: { ...artifact, base64: Buffer.from(binary).toString('base64') },
        }),
      },
    }),
  );
}

const ok = {
  ok: true,
  diagnostics: [],
  log: 'Sketch uses 4396 bytes.',
  durationMs: 900,
  artifact: { size: 4396, sha256: 'x' },
};

test('the homepage leads into the app', async ({ page }) => {
  await page.goto(`/?${MOCK}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Put it on the chip.');
  // Not-yet-built features are labelled, not promised.
  await expect(page.getByText('Coming soon').first()).toBeVisible();
  await page.getByRole('link', { name: 'Start your first project' }).click();
  await expect(page).toHaveURL(/\/projects/);
  await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible();
});

test('open an example, upload it, and see the program’s serial output', async ({ page }) => {
  await fakeCompiler(page, ok);
  await page.goto(`/projects?${MOCK}`);
  await page.getByRole('link', { name: /Hello, serial/ }).click();
  await expect(page.getByLabel('Project name')).toHaveValue('Hello, serial');

  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  // The simulated board is running a program, so the app asks for RESET (manifest prompt).
  await expect(
    page.getByRole('status').filter({ hasText: 'Press the RESET button on the board.' }),
  ).toBeVisible();
  await expect(page.getByText('Uploaded. Your program is running.')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId('serial-output')).toContainText('Hello from CodeToChip 0');
  await expect(page.getByRole('button', { name: /· connected$/ })).toBeVisible();
});

test('shows compile errors inline and in plain words', async ({ page }) => {
  await fakeCompiler(page, {
    ok: false,
    diagnostics: [
      {
        file: 'blink.ino',
        line: 4,
        column: 3,
        severity: 'error',
        message: "'pinMod' was not declared in this scope",
      },
    ],
    log: "blink.ino:4:3: error: 'pinMod' was not declared in this scope",
    durationMs: 800,
  });
  await page.goto(`/ide?example=builtin-blink&${MOCK}`);
  await page.getByRole('button', { name: 'Compile', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    "Fix the error in blink.ino line 4: 'pinMod' was not declared in this scope",
  );
  await expect(page.locator('.cm-lintRange-error')).toHaveCount(1);
  await openView(page, 'Problems');
  const problems = page.getByRole('list', { name: 'Problems' });
  await expect(problems).toContainText('“pinMod” isn’t known here');
  await expect(problems).toContainText('blink.ino:4:3');
  await expect(page.getByText('01 · What happened')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeDisabled();
});

test('a guest’s work is saved automatically', async ({ page }) => {
  await page.goto(`/ide?${MOCK}`);
  await page.getByLabel('Project name').fill('My first sketch');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/ide\/[\w-]+/);
  await page.getByRole('link', { name: 'Projects', exact: true }).click();
  await expect(page.getByRole('link', { name: 'My first sketch', exact: true })).toBeVisible();
});

test('works at 380 px wide without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 800 });
  for (const path of [
    `/?${MOCK}`,
    `/projects?${MOCK}`,
    `/ide?example=builtin-blink&${MOCK}`,
    `/help?${MOCK}`,
    `/help/android?${MOCK}`,
  ]) {
    await page.goto(path);
    await expect(page.getByRole('link', { name: 'CodeToChip' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test.describe('phone layout', () => {
  test.use({ viewport: { width: 380, height: 780 }, hasTouch: true, isMobile: true });

  test('one view at a time, with Compile and Upload in the bottom bar', async ({ page }) => {
    await fakeCompiler(page, ok);
    await page.goto(`/ide?example=builtin-hello-serial&${MOCK}`);
    const bar = page.getByRole('navigation', { name: 'Editor' });
    await expect(bar.getByRole('button', { name: 'Upload' })).toBeVisible();
    await expect(page.getByTestId('code-editor')).toBeVisible();
    await expect(page.getByTestId('serial-output')).toBeHidden();

    await bar.getByRole('button', { name: 'Upload' }).click();
    await expect(page.getByText('Uploaded. Your program is running.')).toBeVisible({
      timeout: 15_000,
    });
    // Monitor opens by itself after an upload.
    await expect(page.getByTestId('serial-output')).toContainText('Hello from CodeToChip 0');
    await expect(page.getByTestId('code-editor')).toBeHidden();
  });

  test('symbol toolbar types brackets with their pair, and Tab', async ({ page }) => {
    await page.goto(`/ide?${MOCK}`);
    const editor = page.locator('.cm-content');
    await editor.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    const symbols = page.getByRole('toolbar', { name: 'Symbols' });
    await symbols.getByRole('button', { name: 'Tab' }).click();
    await symbols.getByRole('button', { name: 'Insert {' }).click();
    await symbols.getByRole('button', { name: 'Insert ;' }).click();
    await expect(editor).toHaveText('\t{;}');
    await expect(editor).toBeFocused();
  });
});

test('share a sketch by link; someone else opens it read-only and makes a copy', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`/ide?example=builtin-blink&${MOCK}`);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const link = await page
    .getByRole('dialog', { name: 'Share link' })
    .getByLabel('Link')
    .inputValue();
  expect(link).toMatch(/\/s\/[\w-]+$/);

  // In-memory services live in the page, so open the link in the same page (client navigation).
  await page.evaluate((path) => {
    history.pushState({}, '', path);
    dispatchEvent(new PopStateEvent('popstate'));
  }, new URL(link).pathname);
  await expect(page.getByText(/Shared sketch .* read-only/)).toBeVisible();
  await expect(page.locator('.cm-content')).toContainText('digitalWrite(LED_BUILTIN, HIGH)');
  await expect(page.locator('.cm-content')).toHaveAttribute('aria-readonly', 'true');

  await page.getByRole('button', { name: 'Make a copy' }).click();
  await expect(page).toHaveURL(/\/ide\/[\w-]+/);
  await expect(page.getByLabel('Project name')).toHaveValue('Blink (copy)');
});

test('a broken share link explains itself', async ({ page }) => {
  await page.goto(`/s/does-not-exist?${MOCK}`);
  await expect(page.getByRole('alert')).toContainText('This link doesn’t work');
});

test('classroom: teacher posts an assignment, a student joins and submits, the teacher sees it', async ({
  page,
}) => {
  const signInAs = (uid: string, displayName: string, role: string) =>
    page.evaluate(
      ([uid, displayName, role]) =>
        (globalThis as unknown as { __services: { setUser(u: object): void } }).__services.setUser({
          uid,
          displayName,
          email: null,
          photoURL: null,
          role,
          isAnonymous: false,
        }),
      [uid, displayName, role],
    );

  await page.goto(`/projects?${MOCK}`);
  await signInAs('t1', 'Ms Rao', 'teacher');
  await page.getByRole('link', { name: 'Classes' }).click();
  await page.getByLabel('Class name').fill('Grade 9 Robotics');
  await page.getByRole('button', { name: 'Create class' }).click();
  const code = (await page.getByLabel('Join code').textContent())!.trim();
  expect(code).toMatch(/^[2-9A-Z]{6}$/);
  await page.getByLabel('Assignment title').fill('Blink the LED');
  await page.getByLabel('Instructions').fill('Make it blink twice a second.');
  await page.getByLabel('Starter code').selectOption({ label: 'Example: Blink' });
  await page.getByRole('button', { name: 'Post assignment' }).click();
  await expect(page.getByText('Blink the LED')).toBeVisible();

  await signInAs('s1', 'Asha', 'student');
  await page.getByRole('link', { name: 'Classes' }).click();
  await page.getByLabel('Class code').fill(code.toLowerCase());
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByText('Make it blink twice a second.')).toBeVisible();
  await expect(page.getByText('Not submitted yet')).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('.cm-content')).toContainText('digitalWrite(LED_BUILTIN, HIGH)');
  await page.getByRole('button', { name: 'Submit to class' }).click();
  await expect(page.getByText('Submitted. Your teacher can see it now.')).toBeVisible();

  await signInAs('t1', 'Ms Rao', 'teacher');
  await page.getByRole('link', { name: 'Classes' }).click();
  await page.getByRole('link', { name: /Grade 9 Robotics/ }).click();
  await expect(page.getByText('Students (1)')).toBeVisible();
  await page.getByRole('button', { name: 'Show submissions' }).click();
  await expect(page.getByText('1 of 1 submitted')).toBeVisible();
  await page.getByRole('button', { name: 'Asha' }).click();
  await expect(page.getByRole('dialog', { name: 'Asha’s submission' })).toContainText(
    'digitalWrite',
  );
});

test('classroom: guests are asked to sign in before joining', async ({ page }) => {
  await page.goto(`/classes?${MOCK}`);
  await expect(page.getByText('Sign in with Google to join a class')).toBeVisible();
});

test('telemetry: an upload records anonymous compile and flash events; opting out stops it', async ({
  page,
}) => {
  const events = () =>
    page.evaluate(
      () =>
        (globalThis as unknown as { __services: { events: Record<string, unknown>[] } }).__services
          .events,
    );
  await fakeCompiler(page, ok);
  await page.goto(`/ide?example=builtin-hello-serial&${MOCK}`);
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(page.getByText('Uploaded. Your program is running.')).toBeVisible({
    timeout: 15_000,
  });
  const recorded = await events();
  expect(recorded.map((e) => [e.kind, e.ok])).toEqual([
    ['compile', true],
    ['flash', true],
  ]);
  expect(recorded[1]).toMatchObject({
    board: 'aries-v3',
    protocol: 'vega-xmodem',
    bytes: 4396,
    app: 'web',
  });
  // Nothing identifying: no user id, no code, no file names.
  expect(JSON.stringify(recorded)).not.toMatch(/uid|hello\.ino|Serial\.begin/);

  await page.getByRole('link', { name: 'Help' }).click();
  await page.getByLabel('Share anonymous usage statistics').uncheck();
  await page.goBack();
  await page.getByRole('button', { name: 'Compile', exact: true }).first().click();
  await page.waitForTimeout(500);
  expect(await events()).toHaveLength(2);
});

test('email sign-in link: a guest’s work is kept after signing in by email', async ({ page }) => {
  type Mem = { __services: { sentLinks: { link: string }[] } };
  await page.goto(`/ide?${MOCK}`);
  await page.getByLabel('Project name').fill('Guest work');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Sign in to keep your work' }).click();
  await page.getByLabel('Email address').fill('asha@example.com');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Check your email for a sign-in link')).toBeVisible();

  // Arrive at the emailed link (in-app navigation: in-memory accounts live in this page).
  const link = new URL(
    await page.evaluate(() => (globalThis as unknown as Mem).__services.sentLinks[0]!.link),
  );
  await page.evaluate((path) => {
    history.pushState({}, '', path);
    dispatchEvent(new PopStateEvent('popstate'));
  }, link.pathname + link.search);
  await expect(page.getByText('You’re signed in.')).toBeVisible();
  await expect(page.getByText('asha@example.com')).toBeVisible();
  await expect(page).not.toHaveURL(/emailLink=/);

  await page.getByRole('link', { name: 'Projects', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Guest work', exact: true })).toBeVisible();
});
