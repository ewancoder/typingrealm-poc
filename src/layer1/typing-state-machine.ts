/**
  * Layer 1 — Typing State Machine (orchestrator)
  *
  * This is the main entry point for the typing engine's pure logic.
  * It receives a keystroke, decides what category it falls into, and
  * delegates to the appropriate handler:
  *
  *   - Releases       → ignored (Layer 3 still records them for dwell time)
  *   - Modifier keys  → ignored (Shift, Ctrl, etc.)
  *   - Backspace      → handle-backspace.ts
  *   - Printable char → handle-printable.ts
  *   - Other named keys (Enter, arrows, etc.) → ignored
  *
  * This file has NO logic of its own beyond the routing above. All the
  * actual state transitions live in the handler files, and all the shared
  * utilities live in helpers.ts.
  *
  * KEY DESIGN RULE: processKeystroke NEVER mutates the input state.
  * It always returns a fresh state object (plus events). This enables
  * replay, undo, and server-side validation with identical behavior.
  */

import type { KeystrokeInput } from '../layer0/keystroke-capture.js';
import type {
    EngineConfig,
    GlyphGroup,
    ProcessResult,
    TypeableUnit,
    TypingState,
} from './types.js';
import { DEFAULT_ENGINE_CONFIG } from './types.js';
import { MODIFIER_KEYS, isPrintable } from './helpers.js';
import { handleBackspace } from './handle-backspace.js';
import { handlePrintable } from './handle-printable.js';

// Re-export ProcessResult so existing consumers (main.ts) don't break.
export type { ProcessResult } from './types.js';

// ---------------------------------------------------------------------------
// State factory
// ---------------------------------------------------------------------------

/**
  * Create a fresh TypingState ready for a new session.
  *
  * @param sequence    - The units to type (from a TextProvider).
  * @param glyphGroups - CJK glyph groups (empty array for Latin).
  * @param config      - Engine config (optional, defaults to standard behavior).
  */
export function createInitialState(
    sequence: TypeableUnit[],
    glyphGroups: GlyphGroup[],
    config?: Partial<EngineConfig>,
): TypingState {
    return {
        config: { ...DEFAULT_ENGINE_CONFIG, ...config },
        sequence,
        glyphGroups,
        cursor: 0,
        active: true,
        paused: false,
        pausedAt: null,
        pauseRecords: [],
        startedAt: null,
        finishedAt: null,
    };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
  * Process one keystroke against the current typing state.
  *
  * Returns:
  *   - state:  the new TypingState (NEVER the same object mutated).
  *   - events: zero or more TypingEvents for the renderer and recorder.
  *
  * Call flow:
  *   1. Layer 0 captures a raw keystroke → KeystrokeInput.
  *   2. main.ts calls processKeystroke(currentState, input).
  *   3. This function routes to the right handler.
  *   4. main.ts replaces its state and forwards events to Layers 2 & 3.
  */
export function processKeystroke(
    state: TypingState,
    input: KeystrokeInput,
): ProcessResult {
    // --- Already finished? Ignore all input. ---
    if (!state.active) {
        return { state, events: [] };
    }

    // --- Paused? Ignore all input. ---
    if (state.paused) {
        return { state, events: [] };
    }

    // --- Key releases don't change state. ---
    // Layer 3 (session recorder) still captures them for dwell-time analytics,
    // but the state machine has nothing to do.
    if (input.action === 'release') {
        return { state, events: [] };
    }

    // --- Modifier keys (Shift, Ctrl, etc.) are no-ops. ---
    if (MODIFIER_KEYS.has(input.key)) {
        return { state, events: [] };
    }

    // --- Start the session clock on the first valid keystroke. ---
    // We accumulate events in an array that gets passed to the handler,
    // so the 'started' event always comes first in the event list.
    const events: import('./types.js').TypingEvent[] = [];
    let startedAt = state.startedAt;

    if (startedAt === null) {
        startedAt = input.perf;
        events.push({ type: 'started', perf: input.perf });
    }

    // --- Route to the appropriate handler. ---

    if (input.key === 'Backspace') {
        return handleBackspace(state, startedAt, events);
    }

    if (isPrintable(input.key)) {
        return handlePrintable(state, input.key, input.perf, startedAt, events);
    }

    // --- Any other named key (Enter, ArrowLeft, F1, etc.) — ignore. ---
    // Still return possibly-updated startedAt (if this was the first key).
    return {
        state: startedAt === state.startedAt ? state : { ...state, startedAt },
        events,
    };
}

// ---------------------------------------------------------------------------
// Pause / Resume
// ---------------------------------------------------------------------------

/**
  * Pause the typing session. While paused, processKeystroke is a no-op.
  * Records the pause start time for timing analytics.
  */
export function pauseInput(state: TypingState): TypingState {
    if (state.paused || !state.active) return state;
    return {
        ...state,
        paused: true,
        pausedAt: performance.now(),
    };
}

/**
  * Resume a paused typing session. Records the pause interval so analytics
  * can exclude paused time from WPM / timing calculations.
  */
export function resumeInput(state: TypingState): TypingState {
    if (!state.paused || !state.active) return state;
    const now = performance.now();
    const record = state.pausedAt !== null
        ? { pausedAt: state.pausedAt, resumedAt: now }
        : null;
    return {
        ...state,
        paused: false,
        pausedAt: null,
        pauseRecords: record
            ? [...state.pauseRecords, record]
            : state.pauseRecords,
    };
}
