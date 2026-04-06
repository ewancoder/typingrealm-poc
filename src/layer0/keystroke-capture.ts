/**
  * Layer 0 — Keystroke Capture
  *
  * The sacred hot path. This is the FIRST code that runs when the user
  * presses or releases a key.
  *
  * Responsibilities (and nothing else):
  *   1. Capture performance.now() as the VERY FIRST operation.
  *   2. Normalize the key into our canonical format.
  *   3. Prevent browser defaults that would interfere (Space scrolling,
  *      Backspace navigation, etc.).
  *   4. Call the callback synchronously.
  *
  * Why performance.now() must be first:
  *   Any work between the browser firing the event and us reading the clock
  *   adds noise to our timing measurements. Even a few microseconds of
  *   normalization logic would skew bigram timing and dwell-time analytics.
  *   So we grab the timestamp, THEN do everything else.
  *
  * Why the callback is synchronous:
  *   Layer 1 (state machine) runs in the same microtask as the event handler.
  *   Since the timestamp is already captured, any downstream computation
  *   doesn't skew the measurement — it happens AFTER the timestamp is locked.
  *
  * This file has NO state, NO rendering, NO decisions about typing correctness.
  */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
  * The normalized keystroke that flows from Layer 0 to Layers 1 and 3.
  *
  * Every single key press and release produces one of these. The state
  * machine (Layer 1) consumes presses; the session recorder (Layer 3)
  * stores both presses and releases for analytics.
  */
export interface KeystrokeInput {
    /**
      * The normalized key identifier.
      *
      * Printable chars: the character itself, case-sensitive ('a', 'A', ' ', '!').
      * Shift: 'LShift' or 'RShift' (distinguished by physical location).
      * Backspace: 'Backspace'.
      * Other named keys: passed through as-is ('Control', 'Alt', 'Enter', etc.).
      */
    key: string;

    /**
      * High-resolution timestamp from performance.now().
      * This is the FIRST thing captured in the event handler — it's as close
      * to the actual keypress moment as JavaScript can get.
      */
    perf: number;

    /** Whether the key was pressed down or released. */
    action: 'press' | 'release';
}

/** Callback signature — Layer 1 and Layer 3 subscribe through this. */
export type KeystrokeCallback = (event: KeystrokeInput) => void;

/** Handle returned by attachKeystrokeCapture — call detach() to stop listening. */
export interface KeystrokeCaptureHandle {
    detach(): void;
}

// ---------------------------------------------------------------------------
// Key normalization
// ---------------------------------------------------------------------------

/**
  * Normalize a browser KeyboardEvent into our canonical key string.
  *
  * Returns null for keys we don't care about (shouldn't happen in practice
  * since all named keys pass through, but null acts as a safety valve).
  *
  * Why we normalize Shift:
  *   The browser gives us 'Shift' for both left and right. But for typing
  *   analytics we want to know WHICH shift key was used (ergonomics analysis,
  *   hand balance). We use event.location to distinguish them.
  */
function normalizeKey(event: KeyboardEvent): string | null {
    const key = event.key;

    // Single printable character — use exactly as the browser gives it.
    // This is case-sensitive: 'a' and 'A' are different keys to us.
    if (key.length === 1) return key;

    // Distinguish left vs right Shift using the DOM key location.
    // Location 1 = left side of keyboard, 2 = right side.
    if (key === 'Shift') {
        return event.location === 1 /* DOM_KEY_LOCATION_LEFT */
            ? 'LShift'
            : 'RShift';
    }

    // Backspace gets its own canonical name.
    if (key === 'Backspace') return 'Backspace';

    // All other named keys (Control, Alt, Meta, Enter, ArrowLeft, F1, etc.)
    // are passed through as-is. The state machine decides what to ignore.
    return key;
}

// ---------------------------------------------------------------------------
// Capture attachment
// ---------------------------------------------------------------------------

/**
  * Attach keystroke capture to a DOM target (usually `window`).
  *
  * Returns a handle with a detach() method to stop listening. Call detach()
  * when a typing session ends to prevent keystrokes from going to a stale
  * session.
  *
  * @param target   - Where to listen for keydown/keyup (typically `window`).
  * @param callback - Called synchronously on every normalized keystroke.
  */
export function attachKeystrokeCapture(
    target: EventTarget,
    callback: KeystrokeCallback,
): KeystrokeCaptureHandle {
    // --- keydown handler ---
    const onKeyDown = (e: Event): void => {
        // SACRED: timestamp capture is the absolute first operation.
        const perf = performance.now();

        const ke = e as KeyboardEvent;
        const key = normalizeKey(ke);
        if (key === null) return;

        // --- Prevent browser defaults that would interfere with typing ---
        //
        // Backspace: would navigate the browser back in history.
        //
        // Printable keys (without Ctrl/Meta/Alt held):
        //   - Space: scrolls the page, activates focused buttons.
        //   - '/': opens quick-find in some browsers.
        //   - Letters: may trigger browser search (type-ahead find).
        //
        // We keep Ctrl/Meta/Alt combos untouched so browser shortcuts
        // (Ctrl+R to reload, Ctrl+C to copy, etc.) still work.
        if (key === 'Backspace') {
            ke.preventDefault();
        } else if (key.length === 1 && !ke.ctrlKey && !ke.metaKey && !ke.altKey) {
            ke.preventDefault();
        }

        callback({ key, perf, action: 'press' });
    };

    // --- keyup handler ---
    const onKeyUp = (e: Event): void => {
        // SACRED: timestamp capture is the absolute first operation.
        const perf = performance.now();

        const ke = e as KeyboardEvent;
        const key = normalizeKey(ke);
        if (key === null) return;

        // No preventDefault on keyup — by the time the key is released,
        // any browser action has already happened on keydown.
        callback({ key, perf, action: 'release' });
    };

    // Attach both listeners.
    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);

    return {
        /** Remove the event listeners. Call this when the session ends. */
        detach(): void {
            target.removeEventListener('keydown', onKeyDown);
            target.removeEventListener('keyup', onKeyUp);
        },
    };
}
