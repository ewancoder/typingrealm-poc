/**
  * Layer 2 — DOM construction.
  *
  * Builds the initial DOM tree for a typing session. Two paths:
  *
  *   Latin: flat list of <span class="ch"> elements, one per character.
  *
  *   CJK:   grouped layout where each glyph gets a wrapper containing:
  *            - <span class="glyph-native"> with the native character (e.g. "食")
  *            - <span class="glyph-romaji"> row of <span class="ch"> for each
  *              romanized character (e.g. s, h, o, k, u)
  *
  * This file only creates elements — it never updates them later.
  * All runtime updates (cursor movement, coloring) happen in dom-renderer.ts.
  */

import type { GlyphGroup, TypeableUnit } from '../layer1/types.js';
import type { DomElements } from './types.js';

// ---------------------------------------------------------------------------
// Latin DOM builder
// ---------------------------------------------------------------------------

/**
  * Build a flat character layout for Latin text.
  *
  * Each character gets its own <span class="ch"> appended directly to
  * the container. No grouping, no wrappers.
  *
  * @param container - The parent element to append spans into.
  * @param sequence  - The typing sequence (one unit per character).
  * @returns DomElements with glyphSpans and unitGroup all null.
  */
export function buildLatinDom(
    container: HTMLElement,
    sequence: TypeableUnit[],
): DomElements {
    const unitSpans: HTMLSpanElement[] = new Array(sequence.length);
    const glyphSpans: (HTMLSpanElement | null)[] = new Array(sequence.length).fill(null);
    const unitGroup: (import('../layer1/types.js').GlyphGroup | null)[] =
        new Array(sequence.length).fill(null);

    sequence.forEach((unit, i) => {
        const span = document.createElement('span');
        span.className = 'ch';
        span.textContent = unit.expected;
        container.appendChild(span);
        unitSpans[i] = span;
    });

    return { unitSpans, glyphSpans, unitGroup };
}

// ---------------------------------------------------------------------------
// CJK DOM builder
// ---------------------------------------------------------------------------

/**
  * Build a grouped character layout for CJK text.
  *
  * Structure per glyph:
  *   <span class="glyph">              ← flexbox wrapper (column)
  *     <span class="glyph-native">食</span>   ← the actual CJK character
  *     <span class="glyph-romaji">            ← row of romanized chars
  *       <span class="ch">s</span>
  *       <span class="ch">h</span>
  *       ...
  *     </span>
  *   </span>
  *
  * @param container   - The parent element to append glyph wrappers into.
  * @param sequence    - The typing sequence (one unit per romanized char).
  * @param glyphGroups - The CJK glyph groups defining the grouping.
  * @returns DomElements with glyphSpans pointing to native-glyph elements
  *          and unitGroup pointing to the GlyphGroup for each unit.
  */
export function buildCjkDom(
    container: HTMLElement,
    sequence: TypeableUnit[],
    glyphGroups: GlyphGroup[],
): DomElements {
    const unitSpans: HTMLSpanElement[] = new Array(sequence.length);
    const glyphSpans: (HTMLSpanElement | null)[] = new Array(sequence.length).fill(null);
    const unitGroup: (GlyphGroup | null)[] = new Array(sequence.length).fill(null);

    for (const group of glyphGroups) {
        // Outer wrapper — holds the native glyph above the romaji row.
        const wrapper = document.createElement('span');
        wrapper.className = 'glyph';

        // Native glyph element (the big CJK character displayed above).
        const native = document.createElement('span');
        native.className = 'glyph-native';
        native.textContent = group.glyph;
        wrapper.appendChild(native);

        // Romaji row — one small <span> per romanized character.
        const row = document.createElement('span');
        row.className = 'glyph-romaji';

        for (const idx of group.unitIndices) {
            const span = document.createElement('span');
            span.className = 'ch';
            span.textContent = sequence[idx].expected;
            row.appendChild(span);

            // Wire up the index maps so the event handler can find things.
            unitSpans[idx] = span;
            glyphSpans[idx] = native;  // Every unit in this group → same native span.
            unitGroup[idx] = group;    // Every unit in this group → same group ref.
        }

        wrapper.appendChild(row);
        container.appendChild(wrapper);
    }

    return { unitSpans, glyphSpans, unitGroup };
}
