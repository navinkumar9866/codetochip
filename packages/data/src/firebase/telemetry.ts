import { addDoc, collection, serverTimestamp, type Firestore } from 'firebase/firestore';
import { COLLECTIONS } from '../schema.ts';
import type { TelemetrySink } from '../services.ts';

/** Append-only events; users can write but never read them (rules). Failures are ignored. */
export function createFirestoreTelemetry(db: Firestore): TelemetrySink {
  return {
    record(event, context) {
      void addDoc(collection(db, COLLECTIONS.telemetry), {
        ...event,
        ...context,
        at: serverTimestamp(),
      }).catch(() => {});
    },
  };
}
