import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createFirebaseAppServices,
  initFirebase,
  resolveFirebaseConfig,
  type FirebaseEnv,
} from '@codetochip/data/firebase';
import { App } from './App.tsx';
import { ServicesProvider } from './services.tsx';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// Phase 0 hardware spike: no backend needed, loaded only on this path.
const SpikeFlash = lazy(() => import('./spike/SpikeFlash.tsx'));

function main() {
  if (location.pathname === '/spike/flash') {
    return (
      <Suspense>
        <SpikeFlash />
      </Suspense>
    );
  }
  // With no VITE_FIREBASE_* env vars set, this talks to the local emulators.
  const services = createFirebaseAppServices(
    initFirebase(resolveFirebaseConfig(import.meta.env as FirebaseEnv)),
  );
  return (
    <ServicesProvider services={services}>
      <App />
    </ServicesProvider>
  );
}

createRoot(root).render(<StrictMode>{main()}</StrictMode>);
