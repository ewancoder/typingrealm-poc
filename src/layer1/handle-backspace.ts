/**
  * Layer 1 — Backspace handling.
  *
  * Two behaviors depending on the current unit's state:
  *
  *   1. Unit is currentlyFailed → "clear in place". The cursor stays where
  *      it is, but the error is cleared so the user can retype. This is
  *      essential for the last character: a normal step-back would move the
  *      cursor to length-2, making the last char unreachable.
  *
  *   2. Unit is NOT currentlyFailed (completed or untouched) → "step back".
  *      The cursor moves back by one and that unit is cleared.
  *
  * In both cases, everFailed is NOT cleared — once a unit has been failed,
  * it stays marked forever for accuracy/WPM calculations.
  */

import type { ProcessResult, TypingEvent, TypingState } from './types.js';
import { cloneUnit, emitGlyphProgress } from './helpers.js';

/**
  * Process a Backspace keystroke.
  *
  * @param state     - Current typing state (never mutated).
  * @param startedAt - The session start timestamp (may have just been set
  *                    by the caller if this is the very first keystroke).
  * @param events    - Events accumulated so far in this processKeystroke call
  *                    (may already contain a 'started' event).
  */
export function handleBackspace(
    state: TypingState,
    startedAt: number | null,
    events: TypingEvent[],
): ProcessResult {
    const currentUnit = state.cursor < state.sequence.length
        ? state.sequence[state.cursor]
        : null;

    // --- Case 1: current unit is failed → clear in place ---
    // The user mistyped here and must backspace to clear the error before
    // retyping. We clear the error without moving the cursor. This is what
    // makes the last-char rule work: the cursor stays on the last char so
    // the user can retype it.
    if (currentUnit && currentUnit.currentlyFailed) {
        const newSequence = state.sequence.slice();
        const unit = cloneUnit(currentUnit);
        unit.currentlyFailed = false;
        // Note: completed is already false (mismatch never sets completed).
        newSequence[state.cursor] = unit;

        const newState: TypingState = {
            ...state,
            sequence: newSequence,
            startedAt,
        };

        events.push({ type: 'backspace', index: state.cursor });
        emitGlyphProgress(newState, unit, events);

        return { state: newState, events };
    }

    // --- Case 2: at the very beginning — nothing to undo ---
    if (state.cursor === 0) {
        return {
            state: startedAt === state.startedAt ? state : { ...state, startedAt },
            events,
        };
    }

    // --- Case 3: step cursor back by one ---
    // The unit under the cursor is clean (completed or untouched), so we
    // move back to the previous unit and clear it.
    const newCursor = state.cursor - 1;

    const newSequence = state.sequence.slice();
    const unit = cloneUnit(newSequence[newCursor]);
    unit.currentlyFailed = false; // No longer showing as wrong.
    unit.completed = false;       // No longer showing as typed.
    // Note: unit.everFailed stays as-is — history is permanent.
    newSequence[newCursor] = unit;

    const newState: TypingState = {
        ...state,
        sequence: newSequence,
        cursor: newCursor,
        startedAt,
    };

    // --- Emit events ---
    events.push({ type: 'backspace', index: newCursor });
    events.push({ type: 'cursor_moved', from: state.cursor, to: newCursor });
    emitGlyphProgress(newState, unit, events);

    return { state: newState, events };
}
