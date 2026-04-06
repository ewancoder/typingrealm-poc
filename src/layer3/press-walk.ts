/**
  * Layer 3 — Press walk reconstruction.
  *
  * To compute bigram timings and error rates, we need to know WHEN each
  * character was correctly typed and HOW MANY errors happened at each
  * position. We can't get this from the final state alone — we need to
  * replay the raw event stream.
  *
  * walkPresses() does exactly that: it walks through all press events
  * (ignoring releases), simulating the cursor movement, and records:
  *   - The timestamp of the first correct press at each position.
  *   - How many wrong presses happened at each position.
  *   - How many total presses happened at each position.
  *
  * This is a lightweight replay — it doesn't build full TypingState objects,
  * just enough to extract timing/error data.
  */

import type { KeystrokeInput } from '../layer0/keystroke-capture.js';
import type { TypeableUnit } from '../layer1/types.js';

// ---------------------------------------------------------------------------
// PressWalk result
// ---------------------------------------------------------------------------

/**
  * The output of walkPresses() — per-index timing and error data.
  *
  * All arrays are indexed by position in the typing sequence (0 = first char).
  */
export interface PressWalk {
    /**
      * For each index: the performance.now() timestamp of the FIRST correct
      * press at that position. Null if the position was never correctly typed
      * (shouldn't happen for a completed session, but can happen mid-session).
      */
    correctAtIndex: (number | null)[];

    /**
      * For each index: how many times a wrong character was pressed there.
      * A value of 2 means the user hit the wrong key twice before getting
      * it right (or backspacing away).
      */
    errorsAtIndex: number[];

    /**
      * For each index: total presses (correct + incorrect).
      * Used as the denominator for error rate calculations.
      */
    attemptsAtIndex: number[];
}

// ---------------------------------------------------------------------------
// Walk function
// ---------------------------------------------------------------------------

/**
  * Replay the raw event stream and extract per-position timing + errors.
  *
  * The walk simulates cursor movement identically to the state machine:
  *   - Correct press → record timestamp, advance cursor.
  *   - Wrong press   → record error, advance cursor (except on last char).
  *   - Backspace     → step cursor back by one.
  *   - Releases and non-printable keys → skip.
  *
  * @param events        - The raw keystroke log from the session recorder.
  * @param finalSequence - The final typing sequence (needed for expected chars
  *                        and to know the sequence length).
  */
export function walkPresses(
    events: readonly KeystrokeInput[],
    finalSequence: readonly TypeableUnit[],
    advanceOnError = true,
    pausePeriods: readonly { start: number; end: number }[] = [],
): PressWalk {
    const len = finalSequence.length;
    const correctAtIndex: (number | null)[] = new Array(len).fill(null);
    const errorsAtIndex: number[] = new Array(len).fill(0);
    const attemptsAtIndex: number[] = new Array(len).fill(0);

    // Precompute a function to subtract accumulated pause time from a timestamp.
    // This ensures bigram timing deltas don't include stun/pause gaps.
    const sortedPauses = pausePeriods.slice().sort((a, b) => a.start - b.start);
    function adjustTimestamp(t: number): number {
        let deduction = 0;
        for (const p of sortedPauses) {
            if (p.end <= t) {
                deduction += p.end - p.start;
            } else if (p.start < t) {
                deduction += t - p.start;
            }
        }
        return t - deduction;
    }

    // Simulate a cursor moving through the sequence, just like the state machine.
    let cursor = 0;

    for (const e of events) {
        // Only process key presses (ignore releases).
        if (e.action !== 'press') continue;

        // Backspace: step back.
        if (e.key === 'Backspace') {
            if (cursor > 0) cursor--;
            continue;
        }

        // Non-printable named keys (Shift, Enter, etc.): skip.
        if (e.key.length !== 1) continue;

        // Past the end: ignore (shouldn't happen in a well-formed log).
        if (cursor >= len) continue;

        // This is a printable press at a valid cursor position.
        attemptsAtIndex[cursor]++;

        const expected = finalSequence[cursor].expected;
        if (e.key === expected) {
            // Correct: record the adjusted timestamp (first correct press only).
            if (correctAtIndex[cursor] === null) {
                correctAtIndex[cursor] = adjustTimestamp(e.perf);
            }
            cursor++;
        } else {
            // Wrong: count the error.
            errorsAtIndex[cursor]++;
            // Mirror state machine: advance on mistake unless advanceOnError is false
            // or we're on the last index (last-char rule).
            if (advanceOnError && cursor < len - 1) cursor++;
        }
    }

    return { correctAtIndex, errorsAtIndex, attemptsAtIndex };
}
