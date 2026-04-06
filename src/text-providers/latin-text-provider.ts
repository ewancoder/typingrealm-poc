/**
  * LatinTextProvider — 1:1 character mapping for latin-script languages.
  */

import type { GeneratedSequence, TextProvider } from './text-provider.js';
import { makeUnit } from './text-provider.js';

function normalize(text: string): string {
    return text
        .replace(/[\n\r]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export const latinTextProvider: TextProvider<string> = {
    generateSequence(source: string): GeneratedSequence {
        const normalized = normalize(source);
        const sequence = Array.from(normalized).map((ch) => makeUnit(ch));
        return { sequence, glyphGroups: [] };
    },
};
