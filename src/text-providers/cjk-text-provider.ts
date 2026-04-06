/**
  * CjkTextProvider — glyph-grouped mapping for CJK input (e.g. Japanese romaji).
  *
  * Input: array of { glyph, romanized } pairs.
  * Output: one TypeableUnit per romanized character, all units of the same
  * glyph share a glyphGroupId.
  */

import type { GlyphGroup } from '../layer1/types.js';
import type { GeneratedSequence, TextProvider } from './text-provider.js';
import { makeUnit } from './text-provider.js';

export interface GlyphText {
    glyph: string;
    romanized: string;
}

export const cjkTextProvider: TextProvider<GlyphText[]> = {
    generateSequence(source: GlyphText[]): GeneratedSequence {
        const sequence = [];
        const glyphGroups: GlyphGroup[] = [];

        for (let g = 0; g < source.length; g++) {
            const { glyph, romanized } = source[g];
            const group: GlyphGroup = { id: g, glyph, unitIndices: [] };
            for (const ch of romanized) {
                const idx = sequence.length;
                sequence.push(makeUnit(ch, g));
                group.unitIndices.push(idx);
            }
            glyphGroups.push(group);
        }

        return { sequence, glyphGroups };
    },
};
