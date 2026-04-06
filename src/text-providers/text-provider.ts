/**
  * TextProvider abstraction — bridges "source content" and "typeable sequence".
  */

import type { GlyphGroup, TypeableUnit } from '../layer1/types.js';

export interface GeneratedSequence {
    sequence: TypeableUnit[];
    glyphGroups: GlyphGroup[];
}

export interface TextProvider<TSource> {
    generateSequence(source: TSource): GeneratedSequence;
}

/** Create a fresh typeable unit with default flags. */
export function makeUnit(
    expected: string,
    glyphGroupId: number | null = null,
): TypeableUnit {
    return {
        expected,
        originalExpected: expected,
        modified: false,
        currentlyFailed: false,
        everFailed: false,
        completed: false,
        glyphGroupId,
        errorSource: null,
    };
}
