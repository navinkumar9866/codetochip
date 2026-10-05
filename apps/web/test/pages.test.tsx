import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { createMemoryServices, type AppServices } from '@codetochip/data';
import { Layout } from '../src/app/Layout.tsx';
import { HelpPage } from '../src/pages/Help.tsx';
import { edited, HomePage } from '../src/pages/Home.tsx';
import { ServicesProvider } from '../src/services.tsx';

afterEach(cleanup);

const renderAt = (path: string, services: AppServices = createMemoryServices()) =>
  render(
    <ServicesProvider services={services}>
      <RouterProvider
        router={createMemoryRouter(
          [
            { path: 'projects', element: <HomePage /> },
            {
              element: <Layout />,
              children: [
                { path: 'help', element: <HelpPage /> },
                { path: 'ide', element: <p>IDE</p> },
              ],
            },
          ],
          { initialEntries: [path] },
        )}
      />
    </ServicesProvider>,
  );

describe('home page', () => {
  it('offers bundled and editor-managed examples as templates for the chosen board', async () => {
    renderAt(
      '/projects',
      createMemoryServices(null, {
        examples: [
          {
            id: 'traffic',
            title: 'Traffic light',
            description: 'Three LEDs',
            boardIds: [],
            files: [],
            published: true,
            order: 1,
          },
        ],
      }),
    );
    expect(screen.getByText('Blink')).toBeTruthy();
    expect(await screen.findByText('Traffic light')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Traffic light/ }).getAttribute('href')).toBe(
      '/ide?board=aries-v3&example=traffic',
    );
  });

  it('lists a guest’s saved projects and deletes one', async () => {
    const services = createMemoryServices();
    await services.auth.ensureUser();
    await services.projects.create({
      name: 'My blink',
      boardId: 'aries-v3',
      files: [{ path: 'a.ino', content: '' }],
    });
    window.confirm = () => true;
    renderAt('/projects', services);
    expect(await screen.findByText('My blink')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete My blink' }));
    await waitFor(() => expect(screen.queryByText('My blink')).toBeNull());
    expect(await services.projects.listMine()).toEqual([]);
  });
});

describe('account bar', () => {
  it('invites a guest to sign in without losing work, then shows the account', async () => {
    const services = createMemoryServices();
    await services.auth.ensureUser();
    await services.projects.create({
      name: 'Keep me',
      boardId: 'aries-v3',
      files: [{ path: 'a.ino', content: '' }],
    });
    renderAt('/projects', services);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in to keep your work' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(await screen.findByText('Test User')).toBeTruthy();
    expect((await services.projects.listMine()).map((p) => p.name)).toEqual(['Keep me']);
  });

  it('signs a guest up with email and password, keeping their work', async () => {
    const services = createMemoryServices();
    const guest = await services.auth.ensureUser();
    renderAt('/projects', services);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in to keep your work' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    expect(screen.getByRole('tab', { name: 'Sign up' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Asha' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'asha@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/at least 8 characters/);
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'blink-led-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Asha')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(services.auth.currentUser()).toMatchObject({ uid: guest.uid, isAnonymous: false });
  });

  it('logs in with a password, explains a wrong one, and sends a reset link', async () => {
    const services = createMemoryServices();
    await services.auth.createAccount({
      name: '',
      email: 'ravi@example.com',
      password: 'p4ssword!',
    });
    await services.auth.signOut();
    renderAt('/projects', services);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    const dialog = screen.getByRole('dialog', { name: 'Log in to CodeToChip' });
    expect(dialog).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ravi@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-one' } });
    expect(screen.getByLabelText('Password').getAttribute('type')).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password').getAttribute('type')).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/don’t match/);

    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(screen.getByLabelText('Email')).toHaveProperty('value', 'ravi@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect((await screen.findByRole('status')).textContent).toMatch(
      /link to choose a new password/,
    );
    expect(services.sentResets).toEqual(['ravi@example.com']);

    fireEvent.click(screen.getByRole('button', { name: 'Back to log in' }));
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'p4ssword!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('ravi@example.com')).toBeTruthy();
  });

  it('closes on Escape', async () => {
    renderAt('/projects', createMemoryServices());
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('help page', () => {
  it('shows board setup steps from the manifest and USB chip driver help', () => {
    renderAt('/help');
    expect(screen.getByText(/Remove the BOOT SEL jumper \(J12\)/)).toBeTruthy();
    expect(screen.getByText(/Silicon Labs CP210x USB to UART driver/)).toBeTruthy();
  });
});

describe('edited', () => {
  it('says when a project was last changed in plain words', () => {
    const now = new Date(2026, 9, 3, 12, 0);
    const ago = (min: number) => edited(new Date(now.getTime() - min * 60000), now);
    expect(ago(0)).toBe('Just now');
    expect(ago(5)).toBe('5 min ago');
    expect(ago(60)).toBe('1 hour ago');
    expect(ago(150)).toBe('3 hours ago');
    expect(edited(new Date(2026, 9, 2, 9, 0), now)).toBe('Yesterday');
    expect(edited(new Date(2026, 8, 28), now)).toMatch(/28/);
  });
});
