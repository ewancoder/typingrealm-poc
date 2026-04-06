/**
  * Layer 1 — Type definitions for the typing state machine.
  *
  * These types define the core data model of the typing engine. They are
  * intentionally plain interfaces (no classes, no methods) so they can be:
  *   1. Serialized/deserialized trivially (for replay, network, storage).
  *   2. Reimplemented 1:1 in C# as records for server-side validation.
  *   3. Tested without any framework or runtime dependency.
  *
  * Nothing in this file has behavior — it's pure data shape definitions.
  */

// ---------------------------------------------------------------------------
// TypeableUnit — one character the user needs to type
// ---------------------------------------------------------------------------

/**
  * A single "slot" in the typing sequence. Each slot holds one expected
  * character and tracks whether the user has typed it correctly, incorrectly,
  * or not at all.
  *
  * For Latin text, each unit is independent.
  * For CJK text, units are grouped under a GlyphGroup (e.g. the 7 chars of
  * "watashi" all belong to the glyph "私").
  */
export interface TypeableUnit {
    /** The character the user must type to complete this unit. */
    expected: string;

    /**
      * What this character was at initialization — never changes.
      * Used by external modification (e.g. game corruption spell) to allow
      * restoring modified characters back to their original value.
      * In training mode this always equals `expected`.
      */
    originalExpected: string;

    /**
      * True if `expected` was changed after initialization by an external
      * command (e.g. modify_sequence). False in training mode.
      * Lets analytics distinguish "typed a corrupted char" from "typed a
      * clean char" — irrelevant for pure typing skill measurement.
      */
    modified: boolean;

    /**
      * True when the user has typed the WRONG character here and hasn't
      * backspaced to fix it yet. Cleared by backspace.
      *
      * This drives the "red highlight" in the renderer.
      */
    currentlyFailed: boolean;

    /**
      * True once the user has EVER typed a wrong character here, even if they
      * later corrected it. Once set, never cleared (within a session).
      *
      * This drives the "corrected / yellow highlight" in the renderer and
      * affects WPM calculation — only never-failed units count as "clean".
      */
    everFailed: boolean;

    /**
      * True when the user has typed the correct character and the cursor has
      * moved past this unit. Cleared by backspace.
      */
    completed: boolean;

    /**
      * Index into TypingState.glyphGroups if this unit is part of a CJK glyph.
      * Null for Latin text (no glyph grouping).
      */
    glyphGroupId: number | null;

    /**
      * What caused the current error state, if any.
      *   'input'    — the player mistyped (normal typing error).
      *   'external' — something outside the engine changed the state
      *                (e.g. a game curse invalidating completed chars).
      *   null       — no error.
      *
      * Analytics uses this to separate player mistakes from external
      * disruptions. Training mode only ever produces 'input' errors.
      */
    errorSource: 'input' | 'external' | null;
}

// ---------------------------------------------------------------------------
// Engine configuration
// ---------------------------------------------------------------------------

/**
  * Configuration flags for the typing state machine.
  * These are set once when creating a session and never change mid-session.
  */
export interface EngineConfig {
    /**
      * Whether incorrect keystrokes advance the cursor past the failed unit.
      *   true  (default) — mismatch advances cursor, player must backspace.
      *   false — cursor stays on the failed character. Player retypes in place
      *           after clearing the error (e.g. after a stun timer expires).
      *
      * Rope War uses false: errors freeze + retype in place.
      * Training mode uses true: standard advance-then-backspace behavior.
      */
    advanceOnError: boolean;
}

/** Default engine config — matches existing behavior. */
export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
    advanceOnError: true,
};

// ---------------------------------------------------------------------------
// GlyphGroup — a CJK glyph made up of multiple romanized characters
// ---------------------------------------------------------------------------

/**
  * Groups multiple TypeableUnits that together represent one CJK glyph.
  *
  * Example: glyph "食" with romanization "shoku" creates 5 TypeableUnits
  * (s, h, o, k, u) all sharing glyphGroupId pointing to this group.
  */
export interface GlyphGroup {
    /** Unique ID for this group (matches the index in TypingState.glyphGroups). */
    id: number;

    /** The native glyph character (e.g. "食", "私"). Displayed above the romaji. */
    glyph: string;

    /** Indices into the sequence array for the units belonging to this glyph. */
    unitIndices: number[];
}

// ---------------------------------------------------------------------------
// TypingState — the full state of a typing session
// ---------------------------------------------------------------------------

/**
  * The complete, immutable snapshot of a typing session at a point in time.
  *
  * processKeystroke() takes a TypingState and returns a NEW TypingState —
  * the old one is never mutated. This makes undo, replay, and debugging
  * trivial: just keep previous states around.
  */
/**
  * A recorded pause interval — when input was paused and resumed.
  * Used to exclude paused time from WPM / timing analytics.
  * Applies to: game stuns, focus loss, training pause button, etc.
  */
export interface PauseRecord {
    pausedAt: number;   // performance.now()
    resumedAt: number;  // performance.now()
}

export interface TypingState {
    /** Engine configuration for this session. */
    config: EngineConfig;

    /** The full sequence of characters to type. */
    sequence: TypeableUnit[];

    /** CJK glyph groups. Empty array for Latin text. */
    glyphGroups: GlyphGroup[];

    /**
      * Index into `sequence` pointing at the character the user is about to type.
      * Starts at 0, advances on correct/incorrect input, decrements on backspace.
      */
    cursor: number;

    /**
      * Whether the session is still accepting input. Set to false when the user
      * successfully completes the last character with no remaining errors.
      */
    active: boolean;

    /**
      * Whether input is currently paused by an external command (game stun,
      * focus loss, etc.). When true, processKeystroke is a no-op.
      * Not used in training mode for now — reserved for game layer.
      */
    paused: boolean;

    /**
      * performance.now() when paused. Null if not currently paused.
      * Used to build PauseRecord when input is resumed.
      */
    pausedAt: number | null;

    /**
      * History of all pause intervals. Analytics subtracts total paused
      * time from elapsed time for WPM / timing calculations.
      */
    pauseRecords: PauseRecord[];

    /**
      * performance.now() timestamp of the first valid keystroke. Null until
      * the user starts typing. Used for WPM/timing calculations.
      */
    startedAt: number | null;

    /**
      * performance.now() timestamp when the session finished. Null until done.
      */
    finishedAt: number | null;
}

// ---------------------------------------------------------------------------
// TypingEvent — things that happen during a typing session
// ---------------------------------------------------------------------------

/**
  * A tagged union of all events the state machine can emit.
  *
  * These events are consumed by:
  *   - Layer 2 (Renderer): to update the visual display.
  *   - Layer 3 (Session Recorder): logged for analytics.
  *
  * The state machine emits events; it never reads them back. This makes the
  * event stream a one-way pipeline from Layer 1 → Layers 2 & 3.
  */
export type TypingEvent =
    /** Session clock started (first keystroke). */
    | { type: 'started'; perf: number }

    /** Cursor moved from one index to another. */
    | { type: 'cursor_moved'; from: number; to: number }

    /** User typed the correct character (never-failed unit). */
    | { type: 'char_correct'; index: number }

    /** User typed the wrong character. */
    | { type: 'char_incorrect'; index: number }

    /** User typed the correct character on a previously-failed unit. */
    | { type: 'char_corrected'; index: number }

    /** User pressed backspace, stepping back to this index. */
    | { type: 'backspace'; index: number }

    /** Session completed — all characters typed correctly. */
    | { type: 'finished'; perf: number }

    /**
      * Progress update for a CJK glyph: `remaining` chars still to type.
      * Emitted on each correct char and backspace within the glyph.
      */
    | { type: 'glyph_progress'; glyphGroupId: number; remaining: number }

    /** All characters in a CJK glyph have been typed correctly. */
    | { type: 'glyph_completed'; glyphGroupId: number };

// ---------------------------------------------------------------------------
// ProcessResult — the return type of processKeystroke()
// ---------------------------------------------------------------------------

/**
  * What processKeystroke() returns: the new state plus any events that
  * occurred as a result of the keystroke.
  *
  * Consumers should:
  *   1. Replace their state reference with result.state.
  *   2. Forward result.events to the renderer and recorder.
  */
export interface ProcessResult {
    state: TypingState;
    events: TypingEvent[];
}
