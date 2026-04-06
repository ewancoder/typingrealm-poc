/**
  * Layer 2 — DOM Renderer (orchestrator)
  *
  * Mounts a typing session into a DOM container and returns a handle that
  * accepts TypingEvents. This is the ONLY file that bridges "typing engine
  * events" and "visual DOM updates".
  *
  * It delegates:
  *   - DOM construction   → build-dom.ts (buildLatinDom / buildCjkDom)
  *   - CJK glyph tinting  → glyph-tint.ts (refreshGlyphTint)
  *
  * The renderer NEVER reads or writes typing state (TypingState). It is
  * purely reactive: events come in, CSS classes change, that's it.
  *
  * Swapping this for Canvas/WebGL means replacing this file + build-dom +
  * glyph-tint. Layers 0, 1, and 3 are untouched.
  */

import type { GlyphGroup, TypeableUnit, TypingEvent } from '../layer1/types.js';
import type { DomElements, DomRendererHandle, UnitRenderState } from './types.js';
import { buildLatinDom, buildCjkDom } from './build-dom.js';
import { refreshGlyphTint } from './glyph-tint.js';

// Re-export so main.ts can keep importing from this file.
export type { DomRendererHandle } from './types.js';

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

/**
  * Set up the DOM for a new typing session and return an event handler.
  *
  * @param container   - The DOM element to render into (cleared first).
  * @param sequence    - The typeable units (from a TextProvider).
  * @param glyphGroups - CJK glyph groups (empty array for Latin).
  */
export function mountDomRenderer(
    container: HTMLElement,
    sequence: TypeableUnit[],
    glyphGroups: GlyphGroup[],
): DomRendererHandle {
    // Clear any previous session's DOM.
    container.innerHTML = '';

    // --- Build the DOM tree ---
    const elements: DomElements =
        glyphGroups.length === 0
            ? buildLatinDom(container, sequence)
            : buildCjkDom(container, sequence, glyphGroups);

    // --- Initialize per-unit render state ---
    // These parallel arrays track the visual state of each unit so we can
    // compute CJK glyph tints without re-reading the DOM.
    const renderState: UnitRenderState = {
        wrong: new Array(sequence.length).fill(false),
        ever: new Array(sequence.length).fill(false),
        completed: new Array(sequence.length).fill(false),
    };

    // Place the cursor on the first character.
    if (elements.unitSpans[0]) {
        elements.unitSpans[0].classList.add('cursor');
    }

    // --- Per-unit state helpers ---

    /**
      * Set a unit's visual state to typed/wrong/corrected.
      * Also updates the render-state flags and refreshes CJK glyph tint.
      */
    const setState = (index: number, cls: 'typed' | 'wrong' | 'corrected'): void => {
        const span = elements.unitSpans[index];
        if (!span) return;

        // Swap CSS class — remove all three, add the one we want.
        span.classList.remove('typed', 'wrong', 'corrected');
        span.classList.add(cls);

        // Update render-state flags.
        renderState.wrong[index] = cls === 'wrong';
        renderState.completed[index] = cls === 'typed' || cls === 'corrected';
        if (cls === 'wrong' || cls === 'corrected') renderState.ever[index] = true;

        // Recompute the CJK glyph tint (no-op for Latin — unitGroup is null).
        refreshGlyphTint(index, elements, renderState);
    };

    /**
      * Clear a unit's visual state (called on backspace).
      * Removes typed/wrong/corrected classes and resets wrong + completed flags.
      * Note: `ever` is NOT cleared — history is permanent.
      */
    const clearState = (index: number): void => {
        const span = elements.unitSpans[index];
        if (!span) return;

        span.classList.remove('typed', 'wrong', 'corrected');
        renderState.wrong[index] = false;
        renderState.completed[index] = false;

        refreshGlyphTint(index, elements, renderState);
    };

    // --- Event handler ---

    const handleEvent = (event: TypingEvent): void => {
        switch (event.type) {
            // Session started — nothing visual to do (cursor is already placed).
            case 'started':
                break;

            // Move the cursor highlight from one span to another.
            case 'cursor_moved': {
                const from = elements.unitSpans[event.from];
                const to = elements.unitSpans[event.to];
                if (from) from.classList.remove('cursor');
                if (to) to.classList.add('cursor');
                break;
            }

            // Correct character — show as green ("typed").
            case 'char_correct':
                setState(event.index, 'typed');
                break;

            // Wrong character — show as red ("wrong").
            case 'char_incorrect':
                setState(event.index, 'wrong');
                break;

            // Corrected character — show as yellow ("corrected").
            case 'char_corrected':
                setState(event.index, 'corrected');
                break;

            // Backspace — clear the unit we stepped back to.
            case 'backspace':
                clearState(event.index);
                break;

            // Session finished — dim everything and remove cursor.
            case 'finished':
                container.classList.add('finished');
                elements.unitSpans.forEach((s) => s && s.classList.remove('cursor'));
                break;

            // Glyph events — tinting is handled by refreshGlyphTint via
            // setState/clearState, so these are no-ops here.
            case 'glyph_progress':
            case 'glyph_completed':
                break;
        }
    };

    return { handleEvent };
}
