/**
 * Session Replay
 *
 * Replays a completed typing session by re-feeding recorded keystroke events
 * through the state machine at their original timing. The renderer receives
 * the resulting TypingEvents exactly as it would during live typing, so the
 * replay looks identical to the original session.
 *
 * Uses requestAnimationFrame for smooth playback — on each frame we check
 * which events should have fired by now (based on elapsed time) and process
 * them in order. This catches up naturally if a frame is late.
 *
 * The replay module knows nothing about rendering. It takes a callback for
 * each keystroke and lets the caller (main.ts) wire it to the state machine
 * and renderer.
 */

import type { KeystrokeInput } from './layer0/keystroke-capture.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Handle to control an in-progress replay. */
export interface ReplayHandle {
    /** Stop the replay immediately. */
    stop(): void;
    /** Promise that resolves when replay finishes or is stopped. */
    done: Promise<void>;
}

/**
 * A prepared replay event with its relative timestamp.
 * `wait` is milliseconds from the first event in the session.
 */
interface ReplayEvent {
    input: KeystrokeInput;
    wait: number;
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

/**
 * Start replaying a session's events.
 *
 * @param events    - The raw keystroke log from a completed session.
 * @param onEvent   - Called for each event at the right time. The caller
 *                    should feed this into processKeystroke + renderer.
 * @param speed     - Playback speed multiplier (1 = real-time, 2 = double).
 * @returns A handle to stop the replay and await completion.
 */
export function startReplay(
    events: readonly KeystrokeInput[],
    onEvent: (input: KeystrokeInput) => void,
    speed: number = 1,
): ReplayHandle {
    if (events.length === 0) {
        return { stop() {}, done: Promise.resolve() };
    }

    let stopped = false;

    // Compute relative wait times from the first event.
    const firstPerf = events[0].perf;
    const replayEvents: ReplayEvent[] = events.map((input) => ({
        input,
        wait: (input.perf - firstPerf) / speed,
    }));

    const done = new Promise<void>((resolve) => {
        let idx = 0;
        const startTime = performance.now();

        function tick(): void {
            if (stopped) {
                resolve();
                return;
            }

            const elapsed = performance.now() - startTime;

            // Process all events that should have fired by now.
            while (idx < replayEvents.length && replayEvents[idx].wait <= elapsed) {
                if (stopped) {
                    resolve();
                    return;
                }
                onEvent(replayEvents[idx].input);
                idx++;
            }

            // If all events have been processed, we're done.
            if (idx >= replayEvents.length) {
                resolve();
                return;
            }

            // Wait for the next frame.
            requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
    });

    return {
        stop() {
            stopped = true;
        },
        done,
    };
}
