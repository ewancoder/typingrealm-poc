/**
 * Shared stats rendering utilities.
 *
 * Used by both the main typing page and the Rope War stats screen
 * to display session analytics with bigram contexts.
 */

import type { TypeableUnit, GlyphGroup } from '../layer1/types.js';
import type { SessionAnalytics } from './types.js';

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtBigram(b: string): string {
    return b.replace(/ /g, '␣');
}

/**
 * Highlight the bigram characters inside a word with <mark> tags.
 */
export function highlightBigram(word: string, bigram: string): string {
    const idx = word.indexOf(bigram);
    if (idx === -1) {
        const spaceIdx = word.indexOf(' ');
        if (spaceIdx !== -1 && spaceIdx > 0) {
            const before = word.slice(0, spaceIdx - 1);
            const c1 = word[spaceIdx - 1];
            const c2 = word[spaceIdx + 1] ?? '';
            const after = word.slice(spaceIdx + 2);
            return `${esc(before)}<mark>${esc(c1)}</mark>␣<mark>${esc(c2)}</mark>${esc(after)}`;
        }
        return esc(word);
    }
    const before = word.slice(0, idx);
    const match = word.slice(idx, idx + bigram.length);
    const after = word.slice(idx + bigram.length);
    return `${esc(before)}<mark>${esc(match)}</mark>${esc(after)}`;
}

/**
 * Build a map of bigram → context words/glyphs for display in stats.
 *
 * @param posFilter - Only include position i if posFilter(i) returns true.
 */
export function buildBigramContexts(
    sourceText: string,
    finalSequence: readonly TypeableUnit[],
    glyphGroups: readonly GlyphGroup[],
    posFilter?: (index: number) => boolean,
): Map<string, string[]> {
    const sets = new Map<string, Set<string>>();

    if (glyphGroups.length === 0) {
        const words = sourceText.split(' ');

        const posToWord: number[] = [];
        let wi = 0;
        for (let c = 0; c < sourceText.length; c++) {
            if (sourceText[c] === ' ') {
                posToWord.push(wi);
                wi++;
            } else {
                posToWord.push(wi);
            }
        }

        for (let i = 1; i < finalSequence.length; i++) {
            if (posFilter && !posFilter(i)) continue;

            const bigram = finalSequence[i - 1].expected + finalSequence[i].expected;
            if (!sets.has(bigram)) sets.set(bigram, new Set());

            const w1 = posToWord[i - 1];
            const w2 = posToWord[i];

            if (w1 === w2) {
                sets.get(bigram)!.add(words[w1]);
            } else {
                sets.get(bigram)!.add(words[w1] + ' ' + words[w2]);
            }
        }
    } else {
        for (let i = 1; i < finalSequence.length; i++) {
            if (posFilter && !posFilter(i)) continue;

            const bigram = finalSequence[i - 1].expected + finalSequence[i].expected;
            if (!sets.has(bigram)) sets.set(bigram, new Set());

            const gid1 = finalSequence[i - 1].glyphGroupId;
            const gid2 = finalSequence[i].glyphGroupId;
            const parts: string[] = [];
            if (gid1 !== null) parts.push(glyphGroups[gid1].glyph);
            if (gid2 !== null && gid2 !== gid1) parts.push(glyphGroups[gid2].glyph);
            if (parts.length > 0) sets.get(bigram)!.add(parts.join(''));
        }
    }

    const contexts = new Map<string, string[]>();
    for (const [bigram, set] of sets) {
        contexts.set(bigram, [...set]);
    }
    return contexts;
}

/**
 * Render session analytics to an HTML string.
 *
 * @param title - Section heading (e.g. "Session stats", "Your Stats").
 * @param analytics - The computed analytics.
 * @param timingContexts - Optional bigram → context words for timing display.
 * @param errorContexts - Optional bigram → context words for error display.
 */
export function renderStatsHtml(
    title: string,
    analytics: SessionAnalytics,
    timingContexts?: Map<string, string[]>,
    errorContexts?: Map<string, string[]>,
): string {
    const fmtContext = (bigram: string, ctxMap?: Map<string, string[]>): string => {
        if (!ctxMap) return '';
        const words = ctxMap.get(bigram);
        if (!words || words.length === 0) return '';
        const highlighted = words.map((w) => highlightBigram(w, bigram));
        return ` <span class="context">in ${highlighted.join(', ')}</span>`;
    };

    const slowest = analytics.bigramTimings
        .slice(0, 5)
        .map(
            (t) =>
                `<li><code>${fmtBigram(t.bigram)}</code> — ${t.avgMs} ms${fmtContext(t.bigram, timingContexts)}</li>`,
        )
        .join('');

    const worst = analytics.bigramErrors
        .filter((t) => t.errorRate > 0)
        .slice(0, 5)
        .map(
            (t) =>
                `<li><code>${fmtBigram(t.bigram)}</code> — ${(t.errorRate * 100).toFixed(1)}% err${fmtContext(t.bigram, errorContexts)}</li>`,
        )
        .join('');

    return `
        <h2>${esc(title)}</h2>
        <div class="stat-row"><span>WPM</span><strong>${analytics.wpm}</strong></div>
        <div class="stat-row"><span>Raw WPM</span><strong>${analytics.rawWpm}</strong></div>
        <div class="stat-row"><span>Accuracy</span><strong>${(analytics.accuracy * 100).toFixed(2)}%</strong></div>
        <div class="stat-row"><span>Errors</span><strong>${analytics.totalErrors} (${analytics.correctedErrors} corrected)</strong></div>
        <h3>Slowest bigrams</h3>
        <ul>${slowest || '<li>(none)</li>'}</ul>
        <h3>Most error-prone bigrams</h3>
        <ul>${worst || '<li>(none)</li>'}</ul>
    `;
}
