import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { lazyServices, type AppServices } from '@codetochip/data';
import type { FirebaseEnv } from '@codetochip/data/firebase';
import { Layout } from './app/Layout.tsx';
import { DeviceProvider } from './ide/device-context.tsx';
import { AndroidPage } from './pages/Android.tsx';
import { HelpPage } from './pages/Help.tsx';
import { ClassesPage } from './pages/Classes.tsx';
import { ClassPage } from './pages/ClassPage.tsx';
import { HomePage } from './pages/Home.tsx';
import { SharePage } from './pages/Share.tsx';
import { ServicesProvider } from './services.tsx';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const IdePage = lazy(() => import('./pages/Ide.tsx').then((m) => ({ default: m.IdePage })));
const SpikeFlash = lazy(() => import('./spike/SpikeFlash.tsx'));

async function memoryServices(): Promise<AppServices | null> {
  // Dev/e2e only: ?services=memory runs without Firebase emulators.
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('services') === 'memory') {
    const { createMemoryServices } = await import('@codetochip/data');
    const services = createMemoryServices();
    // Lets e2e tests sign in as a teacher or a student (setUser).
    Object.assign(globalThis, { __services: services });
    return services;
  }
  return null;
}

// Firebase is downloaded in the background so the first screen appears quickly on mobile data.
// With no VITE_FIREBASE_* env vars set, it talks to the local emulators.
const firebase = () =>
  import('@codetochip/data/firebase').then((m) =>
    m.createFirebaseAppServices(
      m.initFirebase(m.resolveFirebaseConfig(import.meta.env as FirebaseEnv)),
    ),
  );

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'help', element: <HelpPage /> },
      { path: 'help/android', element: <AndroidPage /> },
      { path: 'classes', element: <ClassesPage /> },
      { path: 'classes/:classId', element: <ClassPage /> },
      {
        path: 's/:shareId',
        element: <SharePage />,
      },
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

const services = (await memoryServices()) ?? lazyServices(firebase);
createRoot(root).render(
  <StrictMode>
    <ServicesProvider services={services}>
      <DeviceProvider>
        <RouterProvider router={router} />
      </DeviceProvider>
    </ServicesProvider>
  </StrictMode>,
);
