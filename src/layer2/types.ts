/**
  * Layer 2 — Type definitions for the DOM renderer.
  *
  * These types define the internal data structures the renderer uses to
  * track DOM elements and per-unit visual state. They're consumed by
  * build-dom.ts, glyph-tint.ts, and the main dom-renderer.ts orchestrator.
  */

import type { GlyphGroup, TypingEvent } from '../layer1/types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
  * The handle returned by mountDomRenderer(). The only thing the outside
  * world can do with a renderer is feed it events.
  */
export interface DomRendererHandle {
    handleEvent(event: TypingEvent): void;
}

// ---------------------------------------------------------------------------
// Internal DOM element references
// ---------------------------------------------------------------------------

/**
  * All the DOM elements and index mappings created during mount.
  * Produced by buildLatinDom() or buildCjkDom(), consumed by the
  * event handler in dom-renderer.ts.
  *
  * Arrays are indexed by the unit's position in the typing sequence:
  *   unitSpans[3]  → the <span> for the 4th character
  *   glyphSpans[3] → the native-glyph <span> if unit 3 belongs to a CJK glyph (null for Latin)
  *   unitGroup[3]  → the GlyphGroup if unit 3 belongs to a CJK glyph (null for Latin)
  */
export interface DomElements {
    /** One <span class="ch"> per unit — the actual character elements. */
    unitSpans: HTMLSpanElement[];

    /**
      * For CJK: points to the native-glyph <span> (e.g. the "食" header).
      * For Latin: always null. Indexed by unit position.
      */
    glyphSpans: (HTMLSpanElement | null)[];

    /**
      * For CJK: the GlyphGroup this unit belongs to.
      * For Latin: always null. Indexed by unit position.
      */
    unitGroup: (GlyphGroup | null)[];
}

// ---------------------------------------------------------------------------
// Per-unit render state (for glyph tinting)
// ---------------------------------------------------------------------------

/**
  * Tracks the visual state of each unit so we can compute the aggregate
  * glyph tint (red/yellow/green/blue) for CJK glyphs.
  *
  * These arrays are indexed by unit position, same as DomElements.
  * They're maintained by setState/clearState in dom-renderer.ts and
  * read by refreshGlyphTint in glyph-tint.ts.
  */
export interface UnitRenderState {
    /** True if this unit is currently showing as wrong (red). */
    wrong: boolean[];

    /** True if this unit was EVER wrong (even if now corrected). */
    ever: boolean[];

    /** True if this unit is currently completed (typed correctly). */
    completed: boolean[];
}
