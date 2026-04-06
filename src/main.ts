/**
  * Demo entry point — wires Layers 0–3 + TextProviders together.
  */

import { attachKeystrokeCapture } from './layer0/keystroke-capture.js';
import type { KeystrokeInput } from './layer0/keystroke-capture.js';
import {
    createInitialState,
    processKeystroke,
} from './layer1/typing-state-machine.js';
import type { TypingState } from './layer1/types.js';
import { mountDomRenderer } from './layer2/dom-renderer.js';
import type { DomRendererHandle } from './layer2/dom-renderer.js';
import { mountCanvasRenderer } from './layer2/canvas-renderer.js';
import type { CanvasRendererHandle } from './layer2/canvas-renderer.js';
import { createSessionRecorder } from './layer3/session-recorder.js';
import type { SessionRecorder } from './layer3/session-recorder.js';
import { walkPresses } from './layer3/press-walk.js';
import { buildBigramContexts, renderStatsHtml } from './layer3/stats-renderer.js';
import { latinTextProvider } from './text-providers/latin-text-provider.js';
import { cjkTextProvider } from './text-providers/cjk-text-provider.js';
import { japaneseSample, japaneseSourceText } from './text-providers/japanese-data.js';
import type { JapaneseMode } from './text-providers/japanese-data.js';
import { SAMPLE_CHINESE } from './text-providers/chinese-data.js';
import { startReplay } from './replay.js';
import type { ReplayHandle } from './replay.js';
import type { TypingSessionResult } from './layer3/types.js';

type Mode = 'latin' | 'hiragana' | 'kanji' | 'chinese' | 'russian';
type RendererType = 'dom' | 'canvas';

const SAMPLE_LATIN =
    'the quick brown fox jumps over the lazy dog while a curious owl watches from a tall pine tree as distant thunder rolls across the silent valley below';

const SAMPLE_RUSSIAN =
    'быстрая коричневая лиса прыгает через ленивую собаку пока любопытная сова наблюдает с высокой сосны';

interface Session {
    state: TypingState;
    renderer: DomRendererHandle | CanvasRendererHandle;
    recorder: SessionRecorder;
    sourceText: string;
    startedAtMs: number | null;
    startedAtPerf: number | null;
    finishedAtMs: number | null;
    finishedAtPerf: number | null;
}

let session: Session | null = null;
let captureHandle: { detach(): void } | null = null;
let replayHandle: ReplayHandle | null = null;
let lastResult: TypingSessionResult | null = null;
let lastMode: Mode = 'latin';

const textContainer = document.getElementById('text-container') as HTMLElement;
const statsContainer = document.getElementById('stats') as HTMLElement;
const modeSelect = document.getElementById('mode') as HTMLSelectElement;
const restartBtn = document.getElementById('restart') as HTMLButtonElement;
const kanaToggle = document.getElementById('kana-toggle') as HTMLElement;
const useKatakana = document.getElementById('use-katakana') as HTMLInputElement;
const romajiToggle = document.getElementById('romaji-toggle') as HTMLElement;
const hideRomaji = document.getElementById('hide-romaji') as HTMLInputElement;
const rendererSelect = document.getElementById('renderer') as HTMLSelectElement;
const replayBtn = document.getElementById('replay') as HTMLButtonElement;
const speedSelect = document.getElementById('replay-speed') as HTMLSelectElement;
const speedLabel = document.getElementById('replay-speed-label') as HTMLElement;

/** Resolve the effective Japanese mode: hiragana or katakana based on toggle. */
function resolveJapaneseMode(mode: Mode): JapaneseMode {
    if (mode === 'hiragana' && useKatakana.checked) return 'katakana';
    if (mode === 'hiragana') return 'hiragana';
    return 'kanji';
}

function stopReplay(): void {
    if (replayHandle) {
        replayHandle.stop();
        replayHandle = null;
    }
}

function startSession(mode: Mode): void {
    stopReplay();
    lastMode = mode;
    replayBtn.classList.add('hidden');
    speedLabel.classList.add('hidden');

    const isCjk = mode !== 'latin';

    // Show/hide toggles — kana toggle only for hiragana, romaji toggle for any CJK mode.
    kanaToggle.classList.toggle('hidden', mode !== 'hiragana');
    romajiToggle.classList.toggle('hidden', !isCjk);

    // Apply romaji visibility.
    textContainer.classList.toggle('hide-romaji', isCjk && hideRomaji.checked);

    statsContainer.innerHTML = '';
    statsContainer.classList.remove('visible');

    let generated;
    let sourceText: string;

    if (mode === 'latin') {
        generated = latinTextProvider.generateSequence(SAMPLE_LATIN);
        sourceText = SAMPLE_LATIN;
    } else if (mode === 'russian') {
        generated = latinTextProvider.generateSequence(SAMPLE_RUSSIAN);
        sourceText = SAMPLE_RUSSIAN;
    } else if (mode === 'chinese') {
        generated = cjkTextProvider.generateSequence(SAMPLE_CHINESE);
        sourceText = SAMPLE_CHINESE.map((g) => g.glyph).join('');
    } else {
        const jpMode = resolveJapaneseMode(mode);
        generated = cjkTextProvider.generateSequence(japaneseSample(jpMode));
        sourceText = japaneseSourceText(jpMode);
    }

    const state = createInitialState(generated.sequence, generated.glyphGroups);
    const rendererType = rendererSelect.value as RendererType;
    const renderer = rendererType === 'canvas'
        ? mountCanvasRenderer(
                textContainer,
                generated.sequence,
                generated.glyphGroups,
                () => isCjk && hideRomaji.checked,
            )
        : mountDomRenderer(
                textContainer,
                generated.sequence,
                generated.glyphGroups,
            );
    const recorder = createSessionRecorder();

    session = {
        state,
        renderer,
        recorder,
        sourceText,
        startedAtMs: null,
        startedAtPerf: null,
        finishedAtMs: null,
        finishedAtPerf: null,
    };

    if (captureHandle) captureHandle.detach();
    captureHandle = attachKeystrokeCapture(window, handleKeystroke);
}

function handleKeystroke(input: KeystrokeInput): void {
    if (!session) return;
    session.recorder.record(input);

    const prevStarted = session.state.startedAt;
    const result = processKeystroke(session.state, input);
    session.state = result.state;

    // Track wall-clock start/end for display.
    if (prevStarted === null && session.state.startedAt !== null) {
        session.startedAtMs = Date.now();
        session.startedAtPerf = session.state.startedAt;
    }

    for (const event of result.events) {
        session.renderer.handleEvent(event);
        if (event.type === 'finished') {
            session.finishedAtMs = Date.now();
            session.finishedAtPerf = event.perf;
            finishSession();
        }
    }
}

function finishSession(): void {
    if (!session) return;
    if (
        session.startedAtMs === null ||
        session.startedAtPerf === null ||
        session.finishedAtMs === null ||
        session.finishedAtPerf === null
    ) {
        return;
    }

    const result = session.recorder.buildResult({
        sourceText: session.sourceText,
        finalSequence: session.state.sequence,
        startedAtMs: session.startedAtMs,
        finishedAtMs: session.finishedAtMs,
        startedAtPerf: session.startedAtPerf,
        finishedAtPerf: session.finishedAtPerf,
    });

    console.log('Typing session result:', result);
    lastResult = result;
    replayBtn.classList.remove('hidden');
    speedLabel.classList.remove('hidden');

    // Build per-position timing deltas to filter slow-position contexts.
    const { correctAtIndex } = walkPresses(
        result.events,
        session.state.sequence,
    );
    const positionDelta: (number | null)[] = new Array(session.state.sequence.length).fill(null);
    for (let i = 1; i < session.state.sequence.length; i++) {
        const prev = correctAtIndex[i - 1];
        const curr = correctAtIndex[i];
        if (prev !== null && curr !== null) {
            positionDelta[i] = curr - prev;
        }
    }

    // Compute per-bigram average so we can filter to above-average positions.
    const bigramAvg = new Map<string, number>();
    for (const t of result.analytics.bigramTimings) {
        bigramAvg.set(t.bigram, t.avgMs);
    }

    const seq = session.state.sequence;
    const timingContexts = buildBigramContexts(
        session.sourceText,
        seq,
        session.state.glyphGroups,
        (i) => {
            const dt = positionDelta[i];
            if (dt === null) return false;
            const bigram = seq[i - 1].expected + seq[i].expected;
            const avg = bigramAvg.get(bigram);
            return avg !== undefined && dt >= avg;
        },
    );
    const errorContexts = buildBigramContexts(
        session.sourceText,
        seq,
        session.state.glyphGroups,
        (i) => seq[i].everFailed,
    );
    statsContainer.innerHTML = renderStatsHtml('Session stats', result.analytics, timingContexts, errorContexts);
    statsContainer.classList.add('visible');

    if (captureHandle) {
        captureHandle.detach();
        captureHandle = null;
    }
}


function doReplay(): void {
    if (!lastResult) return;
    stopReplay();

    // Detach live keystroke capture during replay.
    if (captureHandle) {
        captureHandle.detach();
        captureHandle = null;
    }

    const mode = lastMode;
    const isCjk = mode !== 'latin' && mode !== 'russian';

    // Re-generate the same text.
    let generated;
    if (mode === 'latin') {
        generated = latinTextProvider.generateSequence(SAMPLE_LATIN);
    } else if (mode === 'russian') {
        generated = latinTextProvider.generateSequence(SAMPLE_RUSSIAN);
    } else if (mode === 'chinese') {
        generated = cjkTextProvider.generateSequence(SAMPLE_CHINESE);
    } else {
        const jpMode = resolveJapaneseMode(mode);
        generated = cjkTextProvider.generateSequence(japaneseSample(jpMode));
    }

    // Fresh state + renderer.
    const state = createInitialState(generated.sequence, generated.glyphGroups);
    const rendererType = rendererSelect.value as RendererType;
    const renderer = rendererType === 'canvas'
        ? mountCanvasRenderer(
                textContainer,
                generated.sequence,
                generated.glyphGroups,
                () => isCjk && hideRomaji.checked,
            )
        : mountDomRenderer(
                textContainer,
                generated.sequence,
                generated.glyphGroups,
            );

    // Clear stats during replay.
    statsContainer.innerHTML = '';
    statsContainer.classList.remove('visible');

    // Set up a lightweight session for the replay to drive.
    session = {
        state,
        renderer,
        recorder: createSessionRecorder(),
        sourceText: lastResult.text,
        startedAtMs: null,
        startedAtPerf: null,
        finishedAtMs: null,
        finishedAtPerf: null,
    };

    const speed = parseFloat(speedSelect.value) || 1;

    replayBtn.textContent = 'Stop';
    replayHandle = startReplay(
        lastResult.events,
        (input) => {
            // Feed each replayed event through the state machine + renderer,
            // exactly like handleKeystroke but without recording.
            if (!session) return;

            const prevStarted = session.state.startedAt;
            const result = processKeystroke(session.state, input);
            session.state = result.state;

            if (prevStarted === null && session.state.startedAt !== null) {
                session.startedAtMs = Date.now();
                session.startedAtPerf = session.state.startedAt;
            }

            for (const event of result.events) {
                session.renderer.handleEvent(event);
                if (event.type === 'finished') {
                    session.finishedAtMs = Date.now();
                    session.finishedAtPerf = event.perf;
                }
            }
        },
        speed,
    );

    replayHandle.done.then(() => {
        replayHandle = null;
        replayBtn.textContent = 'Replay';
    });
}

modeSelect.addEventListener('change', () => {
    startSession(modeSelect.value as Mode);
});
useKatakana.addEventListener('change', () => {
    startSession(modeSelect.value as Mode);
});
hideRomaji.addEventListener('change', () => {
    if (rendererSelect.value === 'canvas') {
        // Canvas renderer reads hideRomaji via callback — restart to redraw.
        startSession(modeSelect.value as Mode);
    } else {
        textContainer.classList.toggle('hide-romaji', hideRomaji.checked);
    }
});
rendererSelect.addEventListener('change', () => {
    startSession(modeSelect.value as Mode);
});
replayBtn.addEventListener('click', () => {
    if (replayHandle) {
        // Clicking during replay → stop and restart fresh session.
        stopReplay();
        replayBtn.textContent = 'Replay';
        startSession(modeSelect.value as Mode);
    } else {
        doReplay();
    }
});
restartBtn.addEventListener('click', () => {
    startSession(modeSelect.value as Mode);
});

startSession('latin');
