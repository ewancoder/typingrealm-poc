/**
  * Layer 1 — Printable character handling.
  *
  * This is the core typing logic. When the user presses a printable key,
  * we compare it to the expected character at the cursor position.
  *
  * Two outcomes:
  *   MATCH    → mark unit completed, advance cursor, maybe finish session.
  *   MISMATCH → mark unit failed, advance cursor (except on last char).
  *
  * The "last-char rule" is critical: on the final character, a wrong press
  * does NOT advance the cursor past the end. The user must backspace and
  * retype. This prevents a deadlock where the session can never finish
  * because the cursor is past the last character but it's still wrong.
  */

import type { ProcessResult, TypeableUnit, TypingEvent, TypingState } from './types.js';
import { cloneUnit, emitGlyphProgress } from './helpers.js';

/**
  * Process a printable character keystroke.
  *
  * @param state     - Current typing state (never mutated).
  * @param key       - The single character the user pressed.
  * @param perf      - performance.now() timestamp from Layer 0.
  * @param startedAt - Session start timestamp.
  * @param events    - Events accumulated so far in this processKeystroke call.
  */
export function handlePrintable(
    state: TypingState,
    key: string,
    perf: number,
    startedAt: number | null,
    events: TypingEvent[],
): ProcessResult {
    // Guard: cursor past end shouldn't happen, but be safe.
    if (state.cursor >= state.sequence.length) {
        return { state, events };
    }

    const currentIndex = state.cursor;
    const currentUnit = state.sequence[currentIndex];

    // --- Must backspace before retyping a failed unit ---
    // If the unit is currently wrong, ignore all printable input. The user
    // must press Backspace first to clear the error, then retype.
    if (currentUnit.currentlyFailed) {
        return {
            state: startedAt === state.startedAt ? state : { ...state, startedAt },
            events,
        };
    }

    const matches = currentUnit.expected === key;

    // Clone the sequence so we can modify the current unit.
    const newSequence = state.sequence.slice();
    const updated = cloneUnit(currentUnit);

    if (matches) {
        return handleMatch(state, newSequence, updated, currentIndex, perf, startedAt, events);
    } else {
        return handleMismatch(state, newSequence, updated, currentIndex, startedAt, events);
    }
}

// ---------------------------------------------------------------------------
// Match — user typed the correct character
// ---------------------------------------------------------------------------

function handleMatch(
    state: TypingState,
    newSequence: TypeableUnit[],
    updated: TypeableUnit,
    currentIndex: number,
    perf: number,
    startedAt: number | null,
    events: TypingEvent[],
): ProcessResult {
    const wasFailed = updated.everFailed;

    // Mark this unit as completed.
    updated.completed = true;
    updated.currentlyFailed = false;
    newSequence[currentIndex] = updated;

    // Emit the appropriate event: char_correct (clean) or char_corrected
    // (was previously wrong at some point, now fixed).
    events.push(
        wasFailed
            ? { type: 'char_corrected', index: currentIndex }
            : { type: 'char_correct', index: currentIndex },
    );

    // --- Advance cursor ---
    const isLast = currentIndex === state.sequence.length - 1;
    // On the last char, cursor goes to sequence.length (one past end).
    // The renderer handles this gracefully — there's no span at that index,
    // so the cursor highlight simply disappears. This is the correct UX:
    // no underline means "nothing left to type here, go fix your errors".
    const newCursor = isLast ? state.sequence.length : currentIndex + 1;

    events.push({ type: 'cursor_moved', from: currentIndex, to: newCursor });

    const newState: TypingState = {
        ...state,
        sequence: newSequence,
        cursor: newCursor,
        startedAt,
    };

    // CJK glyph progress tracking (no-op for Latin — glyphGroupId is null).
    emitGlyphProgress(newState, updated, events);

    // --- Check if session is finished ---
    if (isLast) {
        // Session finishes ONLY if no units are currently in a failed state.
        // If some earlier unit is still wrong (user skipped past it), they
        // need to go back and fix it.
        const anyFailed = newSequence.some((u) => u.currentlyFailed);
        if (!anyFailed) {
            const finishedState: TypingState = {
                ...newState,
                active: false,
                finishedAt: perf,
            };
            events.push({ type: 'finished', perf });
            return { state: finishedState, events };
        }
    }

    return { state: newState, events };
}

// ---------------------------------------------------------------------------
// Mismatch — user typed the wrong character
// ---------------------------------------------------------------------------

function handleMismatch(
    state: TypingState,
    newSequence: TypeableUnit[],
    updated: TypeableUnit,
    currentIndex: number,
    startedAt: number | null,
    events: TypingEvent[],
): ProcessResult {
    // Mark as failed (both current and permanent).
    updated.currentlyFailed = true;
    updated.everFailed = true;
    updated.errorSource = 'input';
    newSequence[currentIndex] = updated;

    events.push({ type: 'char_incorrect', index: currentIndex });

    // advanceOnError: true (default) — cursor moves past the mistake.
    // advanceOnError: false (rope war) — cursor stays, player retypes in place.
    const advance = state.config.advanceOnError;
    const newCursor = advance ? currentIndex + 1 : currentIndex;

    if (advance) {
        events.push({ type: 'cursor_moved', from: currentIndex, to: newCursor });
    }

    const newState: TypingState = {
        ...state,
        sequence: newSequence,
        cursor: newCursor,
        startedAt,
    };

    return { state: newState, events };
}
