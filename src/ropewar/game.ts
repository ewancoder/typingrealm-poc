/**
 * Game screen — wires the typing engine to the Rope War server.
 *
 * On each keystroke:
 *   - Correct: send correct_keystroke to server.
 *   - Incorrect: pause input for 2s (stun), send player_stumbled,
 *     then resume and clear error so the player can retype.
 *   - Finished: send text_completed to server.
 */

import { attachKeystrokeCapture } from '../layer0/keystroke-capture.js';
import type { KeystrokeInput, KeystrokeCaptureHandle } from '../layer0/keystroke-capture.js';
import {
    createInitialState,
    processKeystroke,
    pauseInput,
    resumeInput,
} from '../layer1/typing-state-machine.js';
import type { TypingState, GlyphGroup } from '../layer1/types.js';
import { mountDomRenderer } from '../layer2/dom-renderer.js';
import type { DomRendererHandle } from '../layer2/dom-renderer.js';
import type { TypeableUnit } from '../layer1/types.js';
import type { PersonalMatchData } from './stats-screen.js';
import { latinTextProvider } from '../text-providers/latin-text-provider.js';
import { cjkTextProvider } from '../text-providers/cjk-text-provider.js';
import { japaneseSentenceAt, japaneseSentenceSourceText, japaneseSentenceCount } from '../text-providers/japanese-data.js';
import { cloneUnit } from '../layer1/helpers.js';
import { computeAnalytics } from '../layer3/analytics.js';
import type { Connection } from './connection.js';
import { updateRope } from './rope-renderer.js';
import {
    initSpriteRenderer,
    updateSpriteRopePosition,
    triggerPullPlayer,
    triggerStumblePlayer,
    triggerRecoverPlayer,
    destroySpriteRenderer,
    resetSprites,
} from './sprite-renderer.js';
import type { ServerMessage, PlayerInfo } from '../shared/protocol.js';

const STUN_DURATION_MS = 5000;
const FADE_DURATION_MS = 2000;

const battleMusic = new Audio('/battle.mp3');
battleMusic.loop = true;
battleMusic.volume = 0.5;
let musicFadeInterval: ReturnType<typeof setInterval> | null = null;

export function startMusic(): void {
    if (musicFadeInterval) {
        clearInterval(musicFadeInterval);
        musicFadeInterval = null;
    }
    battleMusic.volume = 0.5;
    battleMusic.currentTime = 0;
    battleMusic.play().catch(() => { /* autoplay blocked — ignore */ });
}

export function fadeOutMusic(): void {
    if (battleMusic.paused) return;
    const step = 50;
    const decrement = battleMusic.volume / (FADE_DURATION_MS / step);
    musicFadeInterval = setInterval(() => {
        battleMusic.volume = Math.max(0, battleMusic.volume - decrement);
        if (battleMusic.volume <= 0) {
            battleMusic.pause();
            battleMusic.currentTime = 0;
            if (musicFadeInterval) {
                clearInterval(musicFadeInterval);
                musicFadeInterval = null;
            }
        }
    }, step);
}

let state: TypingState | null = null;
let renderer: DomRendererHandle | null = null;
let captureHandle: KeystrokeCaptureHandle | null = null;
let connection: Connection | null = null;
let stunTimer: ReturnType<typeof setTimeout> | null = null;
let myName = '';
let spriteReady = false;
let currentLanguage: 'english' | 'kanji' = 'english';

// Accumulated data across multiple texts for post-match analytics
let allEvents: KeystrokeInput[] = [];
let allSequences: TypeableUnit[] = [];
let allGlyphGroups: GlyphGroup[] = [];
let allSourceTexts: string[] = [];
let gameStartPerf: number | null = null;
let pausePeriods: { start: number; end: number }[] = [];
let currentPauseStart: number | null = null;

const typingArea = document.getElementById('typing-area') as HTMLElement;
let japaneseSentenceIndex = 0;
let currentGlyphGroups: GlyphGroup[] = [];

function setupSession(text: string): void {
    let generated;
    if (currentLanguage === 'kanji') {
        const idx = japaneseSentenceIndex % japaneseSentenceCount();
        japaneseSentenceIndex++;
        generated = cjkTextProvider.generateSequence(japaneseSentenceAt('kanji', idx));
        allSourceTexts.push(japaneseSentenceSourceText('kanji', idx));
    } else {
        generated = latinTextProvider.generateSequence(text);
        allSourceTexts.push(text);
    }
    currentGlyphGroups = generated.glyphGroups;
    state = createInitialState(generated.sequence, generated.glyphGroups, {
        advanceOnError: false,
    });
    renderer = mountDomRenderer(typingArea, generated.sequence, generated.glyphGroups);
}

function clearCurrentError(): void {
    if (!state || !renderer) return;

    const cursor = state.cursor;
    const unit = state.sequence[cursor];
    if (!unit || !unit.currentlyFailed) return;

    // Clone the sequence and clear currentlyFailed on the cursor unit.
    const newSequence = state.sequence.slice();
    const updated = cloneUnit(unit);
    updated.currentlyFailed = false;
    newSequence[cursor] = updated;

    state = {
        ...state,
        sequence: newSequence,
    };

    // Tell the renderer to visually reset this character.
    // Emit a backspace event at the cursor index to clear the 'wrong' class.
    renderer.handleEvent({ type: 'backspace', index: cursor });
}

function handleKeystroke(input: KeystrokeInput): void {
    if (!state || !renderer || !connection) return;

    // Skip recording if engine is paused (stun) — walkPresses doesn't
    // know about pauses and would desync if we included these.
    if (state.paused) return;

    allEvents.push(input);
    if (gameStartPerf === null) gameStartPerf = input.perf;

    const result = processKeystroke(state, input);
    state = result.state;

    for (const event of result.events) {
        renderer.handleEvent(event);

        switch (event.type) {
            case 'char_correct':
            case 'char_corrected':
                connection.send({ type: 'correct_keystroke' });
                triggerPullPlayer(myName);
                break;

            case 'char_incorrect':
                // Pause the engine, send stumble, show stun overlay.
                state = pauseInput(state);
                connection.send({ type: 'player_stumbled' });
                currentPauseStart = performance.now();

                stunTimer = setTimeout(() => {
                    if (!state) return;
                    if (currentPauseStart !== null) {
                        pausePeriods.push({ start: currentPauseStart, end: performance.now() });
                        currentPauseStart = null;
                    }
                    state = resumeInput(state);
                    clearCurrentError();
                    stunTimer = null;
                }, STUN_DURATION_MS);
                break;

            case 'finished':
                // Save completed sequence + glyph groups for merged analytics.
                // Offset glyphGroupIds so they remain unique across texts.
                if (state) {
                    const offset = allGlyphGroups.length;
                    for (const unit of state.sequence) {
                        const clone = { ...unit };
                        if (clone.glyphGroupId !== null) {
                            clone.glyphGroupId = clone.glyphGroupId + offset;
                        }
                        allSequences.push(clone);
                    }
                    allGlyphGroups.push(...currentGlyphGroups);
                }
                connection.send({ type: 'text_completed' });
                break;

            default:
                break;
        }
    }
}

export function handleGameMessage(msg: ServerMessage): void {
    switch (msg.type) {
        case 'next_text':
            setupSession(msg.text);
            break;

        case 'rope_update':
            updateRope(msg.position);
            updateSpriteRopePosition(msg.position);
            break;

        case 'player_stumbled_broadcast': {
            const fallStartTime = performance.now();
            triggerStumblePlayer(msg.playerName, () => {
                // Fall animation finished — start getup for remaining stun time
                const elapsed = performance.now() - fallStartTime;
                const remaining = STUN_DURATION_MS - elapsed;
                if (remaining > 0) {
                    triggerRecoverPlayer(msg.playerName, remaining);
                } else {
                    // Stun already over, just go idle
                    triggerRecoverPlayer(msg.playerName, 500);
                }
            });
            break;
        }

        default:
            break;
    }
}

export function initGame(text: string, conn: Connection, playerName: string, playerList: PlayerInfo[], language: 'english' | 'kanji'): void {
    connection = conn;
    myName = playerName;
    currentLanguage = language;
    japaneseSentenceIndex = Math.floor(Math.random() * japaneseSentenceCount());
    allEvents = [];
    allSequences = [];
    allGlyphGroups = [];
    allSourceTexts = [];
    gameStartPerf = null;
    pausePeriods = [];
    currentPauseStart = null;
    setupSession(text);

    // Reset rope to center.
    updateRope(0);
    updateSpriteRopePosition(0);

    const gameScreen = document.getElementById('game-screen') as HTMLElement;
    if (!spriteReady) {
        spriteReady = true;
        initSpriteRenderer(gameScreen, playerList);
    } else {
        resetSprites();
    }

    if (captureHandle) {
        captureHandle.detach();
    }
    captureHandle = attachKeystrokeCapture(window, handleKeystroke);
}

export function getMatchData(): PersonalMatchData | null {
    if (allEvents.length === 0 || gameStartPerf === null) return null;

    // Include the current (possibly incomplete) text's sequence + glyph groups
    let sequences: TypeableUnit[];
    let glyphGroups: GlyphGroup[];
    if (state) {
        const offset = allGlyphGroups.length;
        const currentSeq = state.sequence.map((unit) => {
            if (unit.glyphGroupId === null) return unit;
            return { ...unit, glyphGroupId: unit.glyphGroupId + offset };
        });
        sequences = [...allSequences, ...currentSeq];
        glyphGroups = [...allGlyphGroups, ...currentGlyphGroups];
    } else {
        sequences = allSequences;
        glyphGroups = allGlyphGroups;
    }

    if (sequences.length === 0) return null;

    const lastEvent = allEvents[allEvents.length - 1];
    const analytics = computeAnalytics(allEvents, sequences, gameStartPerf, lastEvent.perf, false, pausePeriods);

    return {
        analytics,
        events: allEvents,
        sequences,
        glyphGroups,
        sourceTexts: allSourceTexts,
        pausePeriods,
    };
}

export function destroyGame(): void {
    if (captureHandle) {
        captureHandle.detach();
        captureHandle = null;
    }
    if (stunTimer !== null) {
        clearTimeout(stunTimer);
        stunTimer = null;
    }
    destroySpriteRenderer();
    spriteReady = false;
    typingArea.innerHTML = '';
    state = null;
    renderer = null;
    connection = null;
}
