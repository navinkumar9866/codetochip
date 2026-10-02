import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import type { AppServices } from '@codetochip/data';
import {
  createFirebaseAppServices,
  initFirebase,
  resolveFirebaseConfig,
  type FirebaseEnv,
} from '@codetochip/data/firebase';
import { Layout } from './app/Layout.tsx';
import { DeviceProvider } from './ide/device-context.tsx';
import { HelpPage } from './pages/Help.tsx';
import { HomePage } from './pages/Home.tsx';
import { ServicesProvider } from './services.tsx';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const IdePage = lazy(() => import('./pages/Ide.tsx').then((m) => ({ default: m.IdePage })));
const SpikeFlash = lazy(() => import('./spike/SpikeFlash.tsx'));

async function createServices(): Promise<AppServices> {
  // Dev/e2e only: ?services=memory runs without Firebase emulators.
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('services') === 'memory') {
    const { createMemoryServices } = await import('@codetochip/data');
    return createMemoryServices();
  }
  // With no VITE_FIREBASE_* env vars set, this talks to the local emulators.
  return createFirebaseAppServices(
    initFirebase(resolveFirebaseConfig(import.meta.env as FirebaseEnv)),
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'help', element: <HelpPage /> },
      {
        path: 'ide/:projectId?',
        element: (
          <Suspense fallback={<p className="p-4 text-slate-400">Loading editor…</p>}>
            <IdePage />
          </Suspense>
        ),
      },
    ],
  },
  {
    path: 'spike/flash',
    element: (
      <Suspense>
        <SpikeFlash />
      </Suspense>
    ),
  },
]);

const services = await createServices();
createRoot(root).render(
  <StrictMode>
    <ServicesProvider services={services}>
      <DeviceProvider>
        <RouterProvider router={router} />
      </DeviceProvider>
    </ServicesProvider>
  </StrictMode>,
);
