/**
  * Layer 2 — Glyph tinting logic for CJK mode.
  *
  * In CJK mode, the native glyph character (e.g. "食") needs to reflect
  * the aggregate state of all its romanized characters. This file computes
  * which CSS class the native glyph should have based on per-unit state.
  *
  * PRIORITY (highest wins):
  *   1. RED    (glyph-wrong)     — any unit currently wrong.
  *   2. GREEN  (glyph-done)      — all units completed, none ever failed.
  *   3. YELLOW (glyph-corrected) — all units completed, at least one was ever wrong.
  *   4. BLUE   (glyph-active)    — some progress, not yet complete, no current errors.
  *   5. NEUTRAL (muted)          — nothing typed yet / fully backspaced out.
  *
  * For Latin text (no glyph groups), this module is never called.
  */

import type { DomElements, UnitRenderState } from './types.js';

/**
  * Recompute the CSS class on the native-glyph <span> for the glyph group
  * that unit `index` belongs to.
  *
  * Called after every setState/clearState change. Scans all units in the
  * group to determine the aggregate state, then toggles exactly one of
  * the four tint classes (or none for neutral).
  *
  * @param index      - The unit index that just changed.
  * @param elements   - DOM element references (from build-dom).
  * @param renderState - Per-unit wrong/ever/completed flags.
  */
export function refreshGlyphTint(
    index: number,
    elements: DomElements,
    renderState: UnitRenderState,
): void {
    // Look up which glyph group this unit belongs to.
    const group = elements.unitGroup[index];
    if (!group) return; // Latin unit — no glyph to tint.

    // Find the native-glyph <span> (same for all units in this group).
    const native = elements.glyphSpans[group.unitIndices[0]];
    if (!native) return;

    // --- Scan all units in this glyph group ---
    let anyWrong = false;
    let anyEver = false;
    let completedCount = 0;

    for (const idx of group.unitIndices) {
        if (renderState.wrong[idx]) anyWrong = true;
        if (renderState.ever[idx]) anyEver = true;
        if (renderState.completed[idx]) completedCount++;
    }

    const allCompleted = completedCount === group.unitIndices.length;
    const anyProgress = completedCount > 0;

    // --- Apply exactly the right combination of classes ---
    // Each toggle sets the class to true/false based on the condition.
    // Because of priority, only one will be true at a time.

    // RED: any unit currently wrong → glyph shows red.
    native.classList.toggle('glyph-wrong', anyWrong);

    // GREEN: all done, none ever failed → clean completion.
    native.classList.toggle('glyph-done', !anyWrong && allCompleted && !anyEver);

    // YELLOW: all done, but some were corrected along the way.
    native.classList.toggle('glyph-corrected', !anyWrong && allCompleted && anyEver);

    // BLUE: in progress (some typed, not all, no current errors).
    native.classList.toggle('glyph-active', !anyWrong && !allCompleted && anyProgress);
}
