/**
  * Layer 3 — Analytics computation.
  *
  * Takes the raw keystroke log and the final typing sequence, and computes
  * all session analytics: WPM, raw WPM, accuracy, bigram timings, bigram
  * error rates.
  *
  * This is a pure function — no side effects, no state. Given the same
  * inputs, it always produces the same output. This means analytics can be:
  *   - Computed client-side for instant post-session feedback.
  *   - Recomputed server-side for trust/verification.
  *   - Recomputed later from stored event logs if the algorithm improves.
  *
  * The analytics code NEVER touches the state machine or the renderer.
  * It works purely from the raw event log (Layer 0 output) and the final
  * sequence snapshot.
  */

import type { KeystrokeInput } from '../layer0/keystroke-capture.js';
import type { TypeableUnit } from '../layer1/types.js';
import type { BigramErrorStat, BigramTiming, SessionAnalytics } from './types.js';
import { walkPresses } from './press-walk.js';

// ---------------------------------------------------------------------------
// Main analytics computation
// ---------------------------------------------------------------------------

/**
  * Compute all session analytics from raw events + final sequence.
  *
  * @param events         - The complete raw keystroke log (presses + releases).
  * @param finalSequence  - The final state of the typing sequence.
  * @param startedAtPerf  - performance.now() when the session started.
  * @param finishedAtPerf - performance.now() when the session finished.
  */
export function computeAnalytics(
    events: readonly KeystrokeInput[],
    finalSequence: readonly TypeableUnit[],
    startedAtPerf: number,
    finishedAtPerf: number,
    advanceOnError = true,
    pausePeriods: readonly { start: number; end: number }[] = [],
): SessionAnalytics {
    // --- Duration ---
    // Max(1) prevents division by zero if timestamps are somehow equal.
    const durationMs = Math.max(1, finishedAtPerf - startedAtPerf);
    const minutes = durationMs / 60000;

    // --- Error counts ---
    const totalChars = finalSequence.length;

    // Total errors: characters that were EVER typed wrong.
    const totalErrors = finalSequence.filter((u) => u.everFailed).length;

    // Corrected errors: were wrong at some point but are now completed correctly.
    const correctedErrors = finalSequence.filter(
        (u) => u.everFailed && u.completed && !u.currentlyFailed,
    ).length;

    // --- WPM ---
    // Standard convention: 5 characters = 1 "word".

    // Clean WPM: only characters that were completed AND never failed.
    // This rewards accuracy — if you mistyped and corrected, it doesn't count.
    const cleanChars = finalSequence.filter(
        (u) => u.completed && !u.everFailed,
    ).length;
    const wpm = cleanChars / 5 / minutes;

    // Raw WPM: all printable key presses (including mistakes and retypes).
    // Shows total typing speed without accuracy adjustment.
    const rawPressedChars = events.filter(
        (e) => e.action === 'press' && e.key.length === 1,
    ).length;
    const rawWpm = rawPressedChars / 5 / minutes;

    // --- Accuracy ---
    // 1 − (everFailed / total). A perfect session = 1.0.
    const accuracy = totalChars === 0 ? 1 : 1 - totalErrors / totalChars;

    // --- Bigram analytics ---
    const bigramTimings = computeBigramTimings(events, finalSequence, advanceOnError, pausePeriods);
    const bigramErrors = computeBigramErrors(events, finalSequence, advanceOnError, pausePeriods);

    return {
        wpm: round(wpm),
        rawWpm: round(rawWpm),
        accuracy: round(accuracy, 4),
        totalErrors,
        correctedErrors,
        bigramTimings,
        bigramErrors,
    };
}

// ---------------------------------------------------------------------------
// Bigram timings
// ---------------------------------------------------------------------------

/**
  * Compute average press-to-press timing for each character pair (bigram).
  *
  * We look at consecutive positions in the sequence where both characters
  * were correctly typed, and measure the time between their correct presses.
  *
  * Wrong presses "break the chain" — if the user mistyped position 3,
  * the bigram [2→3] uses the timestamp of when they EVENTUALLY got it right,
  * not when they made the mistake.
  *
  * Results are sorted slowest-first: the top of the list = weak spots.
  */
function computeBigramTimings(
    events: readonly KeystrokeInput[],
    finalSequence: readonly TypeableUnit[],
    advanceOnError: boolean,
    pausePeriods: readonly { start: number; end: number }[],
): BigramTiming[] {
    const { correctAtIndex } = walkPresses(events, finalSequence, advanceOnError, pausePeriods);

    // Accumulate total time and count for each unique bigram string.
    const totals = new Map<string, { sum: number; count: number }>();

    for (let i = 1; i < finalSequence.length; i++) {
        const prev = correctAtIndex[i - 1];
        const curr = correctAtIndex[i];

        // Skip if either position was never correctly typed.
        if (prev === null || curr === null) continue;

        const bigram = finalSequence[i - 1].expected + finalSequence[i].expected;
        const dt = curr - prev; // Time between consecutive correct presses.
        const entry = totals.get(bigram) ?? { sum: 0, count: 0 };
        entry.sum += dt;
        entry.count += 1;
        totals.set(bigram, entry);
    }

    // Convert to sorted array.
    const list: BigramTiming[] = [];
    for (const [bigram, { sum, count }] of totals) {
        list.push({ bigram, avgMs: round(sum / count, 2), count });
    }
    list.sort((a, b) => b.avgMs - a.avgMs); // Slowest first.
    return list;
}

// ---------------------------------------------------------------------------
// Bigram errors
// ---------------------------------------------------------------------------

/**
  * Compute per-transition error rates.
  *
  * For each bigram (consecutive char pair in the sequence), we look at:
  *   - errors: how many wrong presses at the SECOND position.
  *   - attempts: total presses at the SECOND position.
  *
  * The idea: if you consistently mistype the 'h' in "th", the error is
  * attributed to the transition "t→h", not just the letter "h" alone.
  * This captures transition-specific weaknesses.
  *
  * Results are sorted worst-first: the top = most error-prone transitions.
  */
function computeBigramErrors(
    events: readonly KeystrokeInput[],
    finalSequence: readonly TypeableUnit[],
    advanceOnError: boolean,
    pausePeriods: readonly { start: number; end: number }[],
): BigramErrorStat[] {
    const { errorsAtIndex, attemptsAtIndex } = walkPresses(events, finalSequence, advanceOnError, pausePeriods);

    // Accumulate errors and attempts for each unique bigram string.
    const totals = new Map<string, { errors: number; attempts: number }>();

    for (let i = 1; i < finalSequence.length; i++) {
        const bigram = finalSequence[i - 1].expected + finalSequence[i].expected;
        const entry = totals.get(bigram) ?? { errors: 0, attempts: 0 };
        entry.errors += errorsAtIndex[i];
        entry.attempts += attemptsAtIndex[i];
        totals.set(bigram, entry);
    }

    // Convert to sorted array, skip bigrams with zero attempts.
    const list: BigramErrorStat[] = [];
    for (const [bigram, { errors, attempts }] of totals) {
        if (attempts === 0) continue;
        list.push({
            bigram,
            errorRate: round(errors / attempts, 4),
            count: attempts,
        });
    }
    list.sort((a, b) => b.errorRate - a.errorRate); // Worst first.
    return list;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Round a number to a given number of decimal places. */
function round(n: number, digits = 2): number {
    const f = Math.pow(10, digits);
    return Math.round(n * f) / f;
}
