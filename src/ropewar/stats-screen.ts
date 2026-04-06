/**
 * Post-match stats display for Rope War.
 */

import type { MatchStats, TeamStats } from '../shared/protocol.js';
import type { SessionAnalytics } from '../layer3/types.js';
import type { TypeableUnit, GlyphGroup } from '../layer1/types.js';
import type { KeystrokeInput } from '../layer0/keystroke-capture.js';
import { walkPresses } from '../layer3/press-walk.js';
import { buildBigramContexts, renderStatsHtml } from '../layer3/stats-renderer.js';

function renderTeamStats(label: string, stats: TeamStats): string {
    const rows = stats.players.map(
        (p) =>
            `<div class="stat-row">
                <span class="stat-label">${esc(p.name)}</span>
                <span class="stat-value">${p.correctKeystrokes} correct, ${p.errors} errors, ${p.textsCompleted} texts</span>
            </div>`,
    ).join('');

    return `
        <div class="match-stats">
            <h2>${label}</h2>
            <div class="stat-row">
                <span class="stat-label">Total keystrokes</span>
                <span class="stat-value">${stats.totalCorrectKeystrokes}</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Total errors</span>
                <span class="stat-value">${stats.totalErrors}</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Texts completed</span>
                <span class="stat-value">${stats.totalTextsCompleted}</span>
            </div>
            ${rows}
        </div>
    `;
}

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface PausePeriod {
    start: number;
    end: number;
}

export interface PersonalMatchData {
    analytics: SessionAnalytics;
    events: readonly KeystrokeInput[];
    sequences: readonly TypeableUnit[];
    glyphGroups: readonly GlyphGroup[];
    sourceTexts: readonly string[];
    pausePeriods: readonly PausePeriod[];
}

export function showStats(winner: 'a' | 'b', stats: MatchStats, personal?: PersonalMatchData | null): void {
    const winnerText = document.getElementById('winner-text');
    const matchStats = document.getElementById('match-stats');

    if (winnerText) {
        const teamName = winner === 'a' ? 'Team A' : 'Team B';
        winnerText.textContent = `${teamName} wins!`;
        winnerText.className = winner === 'a' ? 'winner-text team-a-wins' : 'winner-text team-b-wins';
    }

    if (matchStats) {
        const durationSec = (stats.duration / 1000).toFixed(1);
        let personalHtml = '';

        if (personal) {
            const { analytics, events, sequences, glyphGroups, sourceTexts } = personal;
            const mergedSourceText = sourceTexts.join(' ');

            // Build timing contexts with position-based filtering
            const { correctAtIndex } = walkPresses(events, sequences, false, personal.pausePeriods);
            const positionDelta: (number | null)[] = new Array(sequences.length).fill(null);
            for (let i = 1; i < sequences.length; i++) {
                const prev = correctAtIndex[i - 1];
                const curr = correctAtIndex[i];
                if (prev !== null && curr !== null) {
                    positionDelta[i] = curr - prev;
                }
            }

            const bigramAvg = new Map<string, number>();
            for (const t of analytics.bigramTimings) {
                bigramAvg.set(t.bigram, t.avgMs);
            }

            const timingContexts = buildBigramContexts(
                mergedSourceText,
                sequences,
                glyphGroups,
                (i) => {
                    const dt = positionDelta[i];
                    if (dt === null) return false;
                    const bigram = sequences[i - 1].expected + sequences[i].expected;
                    const avg = bigramAvg.get(bigram);
                    return avg !== undefined && dt >= avg;
                },
            );

            const errorContexts = buildBigramContexts(
                mergedSourceText,
                sequences,
                glyphGroups,
                (i) => sequences[i].everFailed,
            );

            personalHtml = `<div class="match-stats">${renderStatsHtml('Your Stats', analytics, timingContexts, errorContexts)}</div>`;
        }

        matchStats.innerHTML =
            `<p style="text-align:center; margin-bottom:1rem; color:var(--muted)">Match duration: ${durationSec}s</p>` +
            personalHtml +
            renderTeamStats('Team A', stats.teamAStats) +
            renderTeamStats('Team B', stats.teamBStats);
    }
}
