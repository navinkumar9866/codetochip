import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { boards } from '@codetochip/boards';
import { createMemoryServices } from '@codetochip/data';
import { App } from '../src/App.tsx';
import { ServicesProvider } from '../src/services.tsx';

afterEach(cleanup);

const renderApp = () =>
  render(
    <ServicesProvider services={createMemoryServices()}>
      <App />
    </ServicesProvider>,
  );

describe('App', () => {
  it('lists every board in the registry', () => {
    renderApp();
    for (const b of boards) {
      expect(screen.getByText(b.name)).toBeTruthy();
    }
  });

  it('signs in, creates and deletes a project, signs out', async () => {
    renderApp();
    expect(screen.queryByText('My projects')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    await screen.findByText('No projects yet.');

    fireEvent.click(screen.getByRole('button', { name: '+ New project' }));
    await screen.findByText('Untitled 1');

    fireEvent.click(screen.getByRole('button', { name: 'Delete Untitled 1' }));
    await screen.findByText('No projects yet.');

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.queryByText('My projects')).toBeNull();
  });
});
