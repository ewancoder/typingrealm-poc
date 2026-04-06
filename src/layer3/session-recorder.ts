/**
  * Layer 3 — Session Recorder.
  *
  * The recorder is dead simple: it accumulates raw keystroke events during
  * a typing session, and when asked, packages them into a TypingSessionResult
  * with computed analytics.
  *
  * Separation of concerns:
  *   - This file: event accumulation + result packaging.
  *   - analytics.ts: all the number crunching (WPM, bigrams, etc.).
  *   - press-walk.ts: raw event stream replay for timing extraction.
  *   - types.ts: all the type definitions.
  *
  * The recorder doesn't know about the state machine (Layer 1) or the
  * renderer (Layer 2). It receives raw Layer 0 events and produces a
  * standalone result object.
  */

import type { KeystrokeInput } from '../layer0/keystroke-capture.js';
import type { SessionRecorder } from './types.js';
import { computeAnalytics } from './analytics.js';

// Re-export types that main.ts imports from this file.
export type { SessionRecorder } from './types.js';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
  * Create a new session recorder.
  *
  * Usage in main.ts:
  *   1. const recorder = createSessionRecorder();
  *   2. On every keystroke: recorder.record(input);   // press AND release
  *   3. On session finish:  recorder.buildResult({...});
  *
  * The recorder stores events in memory. For the POC this is fine — a
  * typical session generates a few hundred events at most.
  */
export function createSessionRecorder(): SessionRecorder {
    // The raw event log — every press and release, in order.
    const events: KeystrokeInput[] = [];

    return {
        /**
          * Record a raw keystroke. Called for EVERY key event (press and release),
          * not just the ones the state machine cares about. This is important
          * because releases are needed for dwell-time analytics (how long a key
          * was held down) even though the state machine ignores them.
          */
        record(event) {
            events.push(event);
        },

        /**
          * Get the raw event log (read-only view).
          * Useful for debugging or dumping to console.
          */
        getEvents() {
            return events;
        },

        /**
          * Build the final session result.
          *
          * This is called once when the session finishes. It takes timing info
          * and the final sequence state, computes analytics, and packages
          * everything into a TypingSessionResult.
          *
          * Two timestamp systems are bridged here:
          *   - performance.now() (perf) — high-resolution, monotonic, used for
          *     timing calculations. Not a wall clock.
          *   - Date.now() (Ms) — wall clock time, used for ISO timestamps in
          *     the result. Needed for "when did this session happen?".
          *
          * We use perf for analytics math and Ms for display/storage timestamps.
          */
        buildResult({
            sourceText,
            finalSequence,
            startedAtMs,
            finishedAtMs,
            startedAtPerf,
            finishedAtPerf,
        }) {
            // Delegate all number crunching to analytics.ts.
            const analytics = computeAnalytics(
                events,
                finalSequence,
                startedAtPerf,
                finishedAtPerf,
            );

            return {
                text: sourceText,
                finalSequence: finalSequence.slice(), // Defensive copy.
                startedAt: new Date(startedAtMs).toISOString(),
                finishedAt: new Date(finishedAtMs).toISOString(),
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                // Negate getTimezoneOffset() because JS returns "minutes behind UTC"
                // but we want "minutes ahead of UTC" (the more intuitive convention).
                timezoneOffset: -new Date(startedAtMs).getTimezoneOffset(),
                inputMode: 'guided',
                context: { source: 'training:freeform' },
                pauseRecords: [],
                events: events.slice(), // Defensive copy.
                analytics,
            };
        },
    };
}
