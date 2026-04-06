/**
  * Layer 2 — Canvas Renderer
  *
  * An alternative to dom-renderer.ts that draws the typing session onto a
  * <canvas> element instead of building DOM nodes. This proves that our
  * Layer 1 ↔ Layer 2 abstraction (TypingEvents) is renderer-agnostic.
  *
  * Benefits of canvas over DOM:
  *   - Users can't select, copy, or paste text (anti-cheat).
  *   - Browser extensions / DOM inspectors can't read the content.
  *   - Scales naturally to game-like rendering (future Canvas/WebGL).
  *
  * The public interface is identical to dom-renderer: a mount function that
  * returns { handleEvent(event: TypingEvent): void }. Layers 0, 1, and 3
  * are completely unaware which renderer is active.
  *
  * Approach: maintain internal state arrays (mirroring UnitRenderState)
  * and do a full redraw on every event. Canvas 2D is fast enough for this
  * — we're drawing at most a few hundred characters.
  */

import type { GlyphGroup, TypeableUnit, TypingEvent } from '../layer1/types.js';

// ---------------------------------------------------------------------------
// Public interface (matches DomRendererHandle)
// ---------------------------------------------------------------------------

export interface CanvasRendererHandle {
    handleEvent(event: TypingEvent): void;
}

// ---------------------------------------------------------------------------
// Theme — hardcoded to match styles.css :root variables
// ---------------------------------------------------------------------------

const THEME = {
    bg:        '#20202a',
    fg:        '#e8e8ec',
    muted:     '#6e6e78',
    cursor:    '#63a4ff',
    cursorBg:  'rgba(99, 164, 255, 0.15)',
    correct:   '#7fdc8f',
    wrong:     '#ff6b6b',
    wrongBg:   'rgba(255, 107, 107, 0.15)',
    corrected: '#f0a65c',
    accent:    '#63a4ff',
} as const;

// ---------------------------------------------------------------------------
// Per-unit visual state (equivalent to UnitRenderState + cursor)
// ---------------------------------------------------------------------------

type UnitVisual = 'pending' | 'cursor' | 'correct' | 'wrong' | 'corrected';

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

/**
  * Set up a <canvas> for a new typing session and return an event handler.
  *
  * @param container   - The DOM element to render into (cleared, canvas appended).
  * @param sequence    - The typeable units (from a TextProvider).
  * @param glyphGroups - CJK glyph groups (empty array for Latin).
  * @param hideRomaji  - Callback that returns true when romaji should be hidden.
  */
export function mountCanvasRenderer(
    container: HTMLElement,
    sequence: TypeableUnit[],
    glyphGroups: GlyphGroup[],
    hideRomaji: () => boolean,
): CanvasRendererHandle {
    container.innerHTML = '';

    // --- Create canvas ---
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    container.appendChild(canvas);

    // High-DPI support: draw at 2x and scale down.
    const dpr = window.devicePixelRatio || 1;

    // --- Internal state ---
    const unitVisuals: UnitVisual[] = new Array(sequence.length).fill('pending');
    unitVisuals[0] = 'cursor'; // Cursor starts on first character.
    let finished = false;

    const isCjk = glyphGroups.length > 0;

    // --- Layout constants ---
    const LATIN_FONT_SIZE = 28;
    const LATIN_LINE_HEIGHT = 52;
    const PADDING = 32;
    const CURSOR_UNDERLINE = 2;

    const CJK_NATIVE_SIZE = 34;
    const CJK_ROMAJI_SIZE = 14;
    const CJK_GLYPH_WIDTH = 48;
    const CJK_GLYPH_GAP = 6;
    const CJK_ROW_HEIGHT = 80;

    // --- Sizing ---

    /** Resize canvas to fit container width, compute needed height, and redraw. */
    function resize(): void {
        const width = container.clientWidth;

        // Compute height based on content.
        let height: number;
        if (!isCjk) {
            height = computeLatinHeight(width);
        } else {
            height = computeCjkHeight(width);
        }
        height = Math.max(height, 80);

        // Set CSS size.
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';

        // Set actual pixel size (high-DPI).
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        draw();
    }

    function computeLatinHeight(containerWidth: number): number {
        const usable = containerWidth - PADDING * 2;
        ctx.font = `${LATIN_FONT_SIZE}px 'Fira Code', 'Cascadia Code', ui-monospace, Menlo, monospace`;

        let x = 0;
        let lines = 1;
        for (const unit of sequence) {
            const w = ctx.measureText(unit.expected).width;
            if (x + w > usable && x > 0) {
                x = 0;
                lines++;
            }
            x += w;
        }
        return lines * LATIN_LINE_HEIGHT + PADDING * 2;
    }

    function computeCjkHeight(containerWidth: number): number {
        const usable = containerWidth - PADDING * 2;
        const glyphSlot = CJK_GLYPH_WIDTH + CJK_GLYPH_GAP;
        const perRow = Math.max(1, Math.floor(usable / glyphSlot));
        const rows = Math.ceil(glyphGroups.length / perRow);
        return rows * CJK_ROW_HEIGHT + PADDING * 2;
    }

    // --- Drawing ---

    function draw(): void {
        const w = canvas.width / dpr;
        const h = canvas.height / dpr;

        // Clear.
        ctx.fillStyle = THEME.bg;
        ctx.fillRect(0, 0, w, h);

        // Dim everything when finished.
        ctx.globalAlpha = finished ? 0.5 : 1;

        if (!isCjk) {
            drawLatin(w);
        } else {
            drawCjk(w);
        }

        ctx.globalAlpha = 1;
    }

    function colorForVisual(v: UnitVisual): string {
        switch (v) {
            case 'pending':   return THEME.muted;
            case 'cursor':    return THEME.fg;
            case 'correct':   return THEME.correct;
            case 'wrong':     return THEME.wrong;
            case 'corrected': return THEME.corrected;
        }
    }

    // --- Latin drawing ---

    function drawLatin(containerWidth: number): void {
        const usable = containerWidth - PADDING * 2;
        const font = `${LATIN_FONT_SIZE}px 'Fira Code', 'Cascadia Code', ui-monospace, Menlo, monospace`;
        ctx.font = font;
        ctx.textBaseline = 'middle';

        let x = PADDING;
        let y = PADDING + LATIN_LINE_HEIGHT / 2;

        for (let i = 0; i < sequence.length; i++) {
            const ch = sequence[i].expected;
            const charW = ctx.measureText(ch).width;

            // Wrap if needed.
            if (x - PADDING + charW > usable && x > PADDING) {
                x = PADDING;
                y += LATIN_LINE_HEIGHT;
            }

            const visual = unitVisuals[i];

            // Background highlight for cursor or wrong.
            if (visual === 'cursor') {
                ctx.fillStyle = THEME.cursorBg;
                ctx.fillRect(x, y - LATIN_LINE_HEIGHT / 2 + 4, charW, LATIN_LINE_HEIGHT - 8);
            } else if (visual === 'wrong') {
                ctx.fillStyle = THEME.wrongBg;
                ctx.fillRect(x, y - LATIN_LINE_HEIGHT / 2 + 4, charW, LATIN_LINE_HEIGHT - 8);
            }

            // Character.
            ctx.font = font;
            ctx.fillStyle = colorForVisual(visual);
            ctx.fillText(ch, x, y);

            // Cursor underline.
            if (visual === 'cursor') {
                ctx.fillStyle = THEME.cursor;
                ctx.fillRect(x, y + LATIN_LINE_HEIGHT / 2 - CURSOR_UNDERLINE - 4, charW, CURSOR_UNDERLINE);
            }

            x += charW;
        }
    }

    // --- CJK drawing ---

    /**
      * Compute the tint color for a CJK native glyph based on its units'
      * aggregate state. Same priority as glyph-tint.ts:
      *   red > green > yellow > blue > muted
      */
    function glyphTint(group: GlyphGroup): string {
        let anyWrong = false;
        let anyEver = false;
        let completedCount = 0;

        for (const idx of group.unitIndices) {
            const v = unitVisuals[idx];
            if (v === 'wrong') anyWrong = true;
            if (v === 'corrected') anyEver = true;
            if (v === 'correct' || v === 'corrected') completedCount++;
        }

        const allDone = completedCount === group.unitIndices.length;
        const anyProgress = completedCount > 0 || group.unitIndices.some(
            (idx) => unitVisuals[idx] === 'cursor',
        );

        if (anyWrong) return THEME.wrong;
        if (allDone && !anyEver) return THEME.correct;
        if (allDone && anyEver) return THEME.corrected;
        if (anyProgress) return THEME.accent;
        return THEME.muted;
    }

    function drawCjk(containerWidth: number): void {
        const usable = containerWidth - PADDING * 2;
        const glyphSlot = CJK_GLYPH_WIDTH + CJK_GLYPH_GAP;
        const perRow = Math.max(1, Math.floor(usable / glyphSlot));

        const nativeFont = `${CJK_NATIVE_SIZE}px 'Noto Sans CJK SC', 'Noto Sans CJK JP', sans-serif`;
        const romajiFont = `${CJK_ROMAJI_SIZE}px 'Fira Code', 'Cascadia Code', ui-monospace, Menlo, monospace`;

        for (let gi = 0; gi < glyphGroups.length; gi++) {
            const group = glyphGroups[gi];
            const col = gi % perRow;
            const row = Math.floor(gi / perRow);

            // Center of this glyph slot.
            const cx = PADDING + col * glyphSlot + CJK_GLYPH_WIDTH / 2;
            const topY = PADDING + row * CJK_ROW_HEIGHT;

            // --- Native glyph ---
            ctx.font = nativeFont;
            ctx.textBaseline = 'top';
            ctx.textAlign = 'center';
            ctx.fillStyle = glyphTint(group);
            ctx.fillText(group.glyph, cx, topY);

            // --- Romaji row ---
            if (!hideRomaji()) {
                ctx.font = romajiFont;
                ctx.textBaseline = 'top';
                ctx.textAlign = 'center';
                const romajiY = topY + CJK_NATIVE_SIZE + 6;

                // Measure total width of romaji chars to center them under the glyph.
                let totalW = 0;
                const charWidths: number[] = [];
                for (const idx of group.unitIndices) {
                    const w = ctx.measureText(sequence[idx].expected).width;
                    charWidths.push(w);
                    totalW += w;
                }

                let rx = cx - totalW / 2;
                for (let ui = 0; ui < group.unitIndices.length; ui++) {
                    const idx = group.unitIndices[ui];
                    const visual = unitVisuals[idx];

                    // Background for cursor / wrong.
                    if (visual === 'cursor') {
                        ctx.fillStyle = THEME.cursorBg;
                        ctx.fillRect(rx, romajiY - 1, charWidths[ui], CJK_ROMAJI_SIZE + 4);
                    } else if (visual === 'wrong') {
                        ctx.fillStyle = THEME.wrongBg;
                        ctx.fillRect(rx, romajiY - 1, charWidths[ui], CJK_ROMAJI_SIZE + 4);
                    }

                    ctx.font = romajiFont;
                    ctx.textAlign = 'left';
                    ctx.fillStyle = colorForVisual(visual);
                    ctx.fillText(sequence[idx].expected, rx, romajiY);

                    // Cursor underline.
                    if (visual === 'cursor') {
                        ctx.fillStyle = THEME.cursor;
                        ctx.fillRect(rx, romajiY + CJK_ROMAJI_SIZE + 2, charWidths[ui], CURSOR_UNDERLINE);
                    }

                    rx += charWidths[ui];
                }
            }
        }
    }

    // --- Event handler ---

    const handleEvent = (event: TypingEvent): void => {
        switch (event.type) {
            case 'started':
                break;

            case 'cursor_moved': {
                // Remove cursor from old position.
                if (event.from < sequence.length && unitVisuals[event.from] === 'cursor') {
                    unitVisuals[event.from] = 'pending';
                }
                // Place cursor at new position.
                if (event.to < sequence.length) {
                    unitVisuals[event.to] = 'cursor';
                }
                break;
            }

            case 'char_correct':
                unitVisuals[event.index] = 'correct';
                break;

            case 'char_incorrect':
                unitVisuals[event.index] = 'wrong';
                break;

            case 'char_corrected':
                unitVisuals[event.index] = 'corrected';
                break;

            case 'backspace':
                unitVisuals[event.index] = 'cursor';
                break;

            case 'finished':
                finished = true;
                // Clear any remaining cursor.
                for (let i = 0; i < unitVisuals.length; i++) {
                    if (unitVisuals[i] === 'cursor') unitVisuals[i] = 'pending';
                }
                break;

            case 'glyph_progress':
            case 'glyph_completed':
                // Tinting is computed from unitVisuals during draw — no-op.
                break;
        }

        draw();
    };

    // --- Initial draw + resize listener ---
    resize();
    const onResize = () => resize();
    window.addEventListener('resize', onResize);

    // Store cleanup on the canvas element so we can detach on re-mount.
    (canvas as unknown as Record<string, unknown>)._cleanup = () => {
        window.removeEventListener('resize', onResize);
    };

    return { handleEvent };
}
