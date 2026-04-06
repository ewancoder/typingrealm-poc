/**
  * Layer 1 — Shared helper functions for the typing state machine.
  *
  * Small, pure utilities used by the backspace and printable-char handlers.
  * Kept separate so each handler file stays focused on its own logic.
  */

import type { TypeableUnit, TypingEvent, TypingState } from './types.js';

// ---------------------------------------------------------------------------
// Modifier keys — these are no-ops in the state machine
// ---------------------------------------------------------------------------

/**
  * Keys the state machine completely ignores. When the user presses Shift,
  * Ctrl, etc., the state machine does nothing — but Layer 0 still captures
  * the raw event so Layer 3 can compute dwell/flight times.
  */
export const MODIFIER_KEYS: ReadonlySet<string> = new Set([
    'LShift',
    'RShift',
    'Control',
    'Alt',
    'Meta',
    'CapsLock',
    'Tab',
    'Escape',
]);

// ---------------------------------------------------------------------------
// Printable-key check
// ---------------------------------------------------------------------------

/**
  * A key is "printable" if it's a single character. Named keys like
  * "Backspace", "Enter", "ArrowLeft" all have length > 1.
  *
  * Layer 0 normalizes single-char keys as-is (case-sensitive), so 'a', 'A',
  * ' ', '3', '!' are all printable. 'Backspace' and 'LShift' are not.
  */
export function isPrintable(key: string): boolean {
    return key.length === 1;
}

// ---------------------------------------------------------------------------
// Unit cloning
// ---------------------------------------------------------------------------

/**
  * Create a shallow copy of a TypeableUnit.
  *
  * We never mutate units in-place — processKeystroke returns a new state
  * with new unit objects. This clone is the starting point for modifications.
  */
export function cloneUnit(u: TypeableUnit): TypeableUnit {
    return {
        expected: u.expected,
        originalExpected: u.originalExpected,
        modified: u.modified,
        currentlyFailed: u.currentlyFailed,
        everFailed: u.everFailed,
        completed: u.completed,
        glyphGroupId: u.glyphGroupId,
        errorSource: u.errorSource,
    };
}

// ---------------------------------------------------------------------------
// Glyph group helpers
// ---------------------------------------------------------------------------

/**
  * Count how many units in a glyph group are NOT yet completed.
  *
  * Used to emit glyph_progress events (tells the renderer how many chars
  * are left) and to detect glyph completion (remaining === 0).
  */
function glyphRemaining(state: TypingState, groupId: number): number {
    const group = state.glyphGroups[groupId];
    if (!group) return 0;

    let remaining = 0;
    for (const idx of group.unitIndices) {
        if (!state.sequence[idx].completed) remaining++;
    }
    return remaining;
}

// ---------------------------------------------------------------------------
// Glyph event emission
// ---------------------------------------------------------------------------

/**
  * If the unit belongs to a CJK glyph, emit glyph_progress (and
  * glyph_completed when all units are done). No-op for Latin units
  * (glyphGroupId is null).
  *
  * Used by both handle-backspace.ts and handle-printable.ts — extracted
  * here to avoid duplication.
  */
export function emitGlyphProgress(
    state: TypingState,
    unit: TypeableUnit,
    events: TypingEvent[],
): void {
    if (unit.glyphGroupId === null) return;

    const remaining = glyphRemaining(state, unit.glyphGroupId);
    events.push({
        type: 'glyph_progress',
        glyphGroupId: unit.glyphGroupId,
        remaining,
    });

    if (remaining === 0) {
        events.push({
            type: 'glyph_completed',
            glyphGroupId: unit.glyphGroupId,
        });
    }
}
