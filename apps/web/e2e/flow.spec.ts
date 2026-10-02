// The Phase 3 flow without hardware: open example → compile → flash → serial output.
// ?services=memory&device=mock (dev builds only) swap Firebase and the USB board for
// in-memory accounts and the simulated VEGA bootloader built from Gate 0 recordings.
// The compile API is faked here so CI needs no Docker; services/compiler has its own tests.
import { expect, test, type Page } from '@playwright/test';

const MOCK = 'services=memory&device=mock';

async function fakeCompiler(page: Page, outcome: object, binary = new Uint8Array(4396).fill(0x13)) {
  let polls = 0;
  await page.route('**/api/compile', (route) =>
    route.fulfill({ status: 202, json: { jobId: 'job-1', position: 1, cached: false } }),
  );
  await page.route('**/api/compile/job-1', (route) =>
    route.fulfill({
      json:
        polls++ === 0
          ? { id: 'job-1', state: 'queued', position: 0 }
          : { id: 'job-1', state: 'succeeded', outcome },
    }),
  );
  await page.route('**/api/artifacts/art-1', (route) =>
    route.fulfill({ body: Buffer.from(binary), contentType: 'application/octet-stream' }),
  );
}

const ok = {
  ok: true,
  diagnostics: [],
  log: 'Sketch uses 4396 bytes.',
  durationMs: 900,
  artifact: { id: 'art-1', url: '/api/artifacts/art-1', size: 4396, sha256: 'x', expiresAt: '' },
};

test('open an example, upload it, and see the program’s serial output', async ({ page }) => {
  await fakeCompiler(page, ok);
  await page.goto(`/?${MOCK}`);
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
  await expect(page.getByText('● Connected · Disconnect')).toBeVisible();
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
  await expect(page.getByRole('list', { name: 'Problems' })).toContainText('blink.ino:4:3');
  await expect(page.locator('.cm-lintRange-error')).toHaveCount(1);
});

test('a guest’s work is saved automatically', async ({ page }) => {
  await page.goto(`/ide?${MOCK}`);
  await page.getByLabel('Project name').fill('My first sketch');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/ide\/[\w-]+/);
  await page.getByRole('link', { name: 'Home' }).click();
  await expect(page.getByRole('link', { name: 'My first sketch' })).toBeVisible();
});

test('works at 380 px wide without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 800 });
  for (const path of [`/?${MOCK}`, `/ide?example=builtin-blink&${MOCK}`, `/help?${MOCK}`]) {
    await page.goto(path);
    await expect(page.getByRole('link', { name: 'CodeToChip' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
