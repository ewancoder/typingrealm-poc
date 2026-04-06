/**
 * Canvas-based sprite renderer for the Rope War tug-of-war visualization.
 *
 * Draws an animated pixel-art character per player on a canvas,
 * with positions shifting based on the rope state.
 */

import type { PlayerInfo } from '../shared/protocol.js';

const SPRITE_SIZE = 32;
const SCALE = 3;
const DRAW_SIZE = SPRITE_SIZE * SCALE; // 96
const CANVAS_HEIGHT = 700;
const DEFAULT_FRAME_DURATION = 180; // ms per animation frame
const PLAYER_SPACING = 20; // px between players on the same team

type AnimName = 'idle' | 'pull' | 'stumble' | 'fall' | 'recover' | 'celebrate' | 'custom';

const ANIMATIONS: Record<string, string[]> = {
    idle:      ['idle_1', 'idle_2'],
    pull:      ['pull_1', 'pull_2', 'pull_3', 'pull_2'],
    stumble:   ['stumble_1', 'stumble_2', 'stumble_3'],
    fall:      ['stumble_1', 'stumble_2', 'stumble_3', 'fallen'],
    recover:   ['stumble_3', 'stumble_2', 'stumble_1', 'idle_1'],
    celebrate: ['celebrate_1', 'celebrate_2', 'celebrate_3', 'celebrate_4', 'celebrate_5', 'celebrate_6'],
};

const GETUP_FRAMES = [
    'getup_01', 'getup_02', 'getup_03', 'getup_04', 'getup_05',
    'getup_06', 'getup_07', 'getup_08', 'getup_09', 'getup_10',
    'getup_11', 'getup_12', 'getup_13', 'getup_14', 'getup_15',
    'getup_16', 'getup_17',
];

const SPRITE_STATES = [
    'idle_1', 'idle_2',
    'pull_1', 'pull_2', 'pull_3',
    'stumble_1', 'stumble_2', 'stumble_3',
    'fallen',
    'celebrate_1', 'celebrate_2', 'celebrate_3',
    'celebrate_4', 'celebrate_5', 'celebrate_6',
    ...GETUP_FRAMES,
];

interface Animator {
    sprites: Record<string, HTMLImageElement>;
    currentAnim: AnimName;
    frameIndex: number;
    frameTimer: number;
    frameDuration: number;
    loop: boolean;
    onAnimEnd: (() => void) | null;
    customSequence: string[] | null;
    name: string;
    team: 'a' | 'b';
}

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let players: Animator[] = [];
let ropePos = 0; // -100 to +100
let bgImage: HTMLImageElement | null = null;
let ropeBitmap: HTMLCanvasElement | null = null;
let animFrameId: number | null = null;
let lastTime = 0;
let blueSprites: Record<string, HTMLImageElement> | null = null;
let redFlipSprites: Record<string, HTMLImageElement> | null = null;

function loadSprites(team: string, flip: boolean): Promise<Record<string, HTMLImageElement>> {
    const suffix = flip ? '_flip' : '';
    const sprites: Record<string, HTMLImageElement> = {};

    return Promise.all(
        SPRITE_STATES.map(state =>
            new Promise<void>((resolve, reject) => {
                const img = new Image();
                img.onload = () => { sprites[state] = img; resolve(); };
                img.onerror = reject;
                img.src = `/sprites/${team}_${state}${suffix}.png`;
            })
        )
    ).then(() => sprites);
}

function createAnimator(name: string, team: 'a' | 'b', sprites: Record<string, HTMLImageElement>): Animator {
    return {
        sprites,
        currentAnim: 'idle',
        frameIndex: 0,
        frameTimer: 0,
        frameDuration: DEFAULT_FRAME_DURATION,
        loop: true,
        onAnimEnd: null,
        customSequence: null,
        name,
        team,
    };
}

function playAnim(
    animator: Animator,
    name: AnimName,
    options: { loop?: boolean; onEnd?: (() => void) | null; frameDuration?: number; customSequence?: string[] } = {},
): void {
    animator.currentAnim = name;
    animator.frameIndex = 0;
    animator.frameTimer = 0;
    animator.frameDuration = options.frameDuration ?? DEFAULT_FRAME_DURATION;
    animator.loop = options.loop ?? true;
    animator.onAnimEnd = options.onEnd ?? null;
    animator.customSequence = options.customSequence ?? null;
}

function getAnimSequence(animator: Animator): string[] {
    if (animator.customSequence) return animator.customSequence;
    return ANIMATIONS[animator.currentAnim] ?? ANIMATIONS['idle'];
}

function updateAnimator(animator: Animator, dt: number): void {
    const seq = getAnimSequence(animator);
    animator.frameTimer += dt;
    if (animator.frameTimer >= animator.frameDuration) {
        animator.frameTimer -= animator.frameDuration;
        animator.frameIndex++;
        if (animator.frameIndex >= seq.length) {
            if (animator.loop) {
                animator.frameIndex = 0;
            } else {
                animator.frameIndex = seq.length - 1;
                if (animator.onAnimEnd) {
                    const cb = animator.onAnimEnd;
                    animator.onAnimEnd = null;
                    cb();
                }
            }
        }
    }
}

function getCurrentSprite(animator: Animator): HTMLImageElement {
    const seq = getAnimSequence(animator);
    const frameName = seq[animator.frameIndex % seq.length];
    return animator.sprites[frameName];
}

function findPlayer(name: string): Animator | undefined {
    return players.find(p => p.name === name);
}

function getTeamPlayers(team: 'a' | 'b'): Animator[] {
    return players.filter(p => p.team === team);
}

/**
 * Build a getup sequence stretched to fill the given duration.
 *
 * Dizzy phase (01-02) loops for the first portion, then the full
 * 03-17 sequence plays. Frame duration is computed so the whole
 * sequence fills exactly `durationMs`.
 */
function buildGetupSequence(durationMs: number): { sequence: string[]; frameDuration: number } {
    // Number of dizzy loop pairs scaled to duration
    const dizzyPairs = Math.max(2, Math.floor(durationMs / 1000));
    const dizzyFrames: string[] = [];
    for (let i = 0; i < dizzyPairs; i++) {
        dizzyFrames.push('getup_01', 'getup_02');
    }

    // Getup frames after dizzy: 03 through 13 (skip second fail + tearful ending)
    const getupFrames = GETUP_FRAMES.slice(2, 13); // getup_03 through getup_13

    const sequence = [...dizzyFrames, ...getupFrames];
    const frameDuration = durationMs / sequence.length;

    return { sequence, frameDuration };
}

function draw(): void {
    if (!ctx || !canvas) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Draw background image with cover fill (no stretching)
    if (bgImage) {
        const imgRatio = bgImage.width / bgImage.height;
        const canvasRatio = w / h;
        let sx = 0, sy = 0, sw = bgImage.width, sh = bgImage.height;
        if (imgRatio > canvasRatio) {
            sw = bgImage.height * canvasRatio;
            sx = (bgImage.width - sw) / 2;
        } else {
            sh = bgImage.width / canvasRatio;
            sy = (bgImage.height - sh) / 2;
        }
        ctx.drawImage(bgImage, sx, sy, sw, sh, 0, 0, w, h);
    }

    // Position sprites at 80% from top (20% off the bottom)
    const ropeY = h * 0.8;

    // Both rope and teams shift by the same amount
    const shift = (ropePos / 100) * (w * 0.15);
    const centerX = w / 2 + shift;

    // Draw rope SVG image
    const ropeW = (w - 40) * 2.3;
    const ropeH = 30;
    if (ropeBitmap) {
        ctx.drawImage(ropeBitmap, centerX - ropeW / 2, ropeY - ropeH / 2, ropeW, ropeH);
    }
    const spriteY = ropeY - DRAW_SIZE / 2;

    // Draw team A players (left side)
    const teamAPlayers = getTeamPlayers('a');
    const teamAWidth = teamAPlayers.length * DRAW_SIZE + (teamAPlayers.length - 1) * PLAYER_SPACING;
    const teamAStartX = w * 0.25 - teamAWidth / 2 + shift;
    for (let i = 0; i < teamAPlayers.length; i++) {
        const px = teamAStartX + i * (DRAW_SIZE + PLAYER_SPACING);
        const sprite = getCurrentSprite(teamAPlayers[i]);
        ctx.drawImage(sprite, px, spriteY, DRAW_SIZE, DRAW_SIZE);
    }

    // Draw team B players (right side)
    const teamBPlayers = getTeamPlayers('b');
    const teamBWidth = teamBPlayers.length * DRAW_SIZE + (teamBPlayers.length - 1) * PLAYER_SPACING;
    const teamBStartX = w * 0.75 - teamBWidth / 2 + shift;
    for (let i = 0; i < teamBPlayers.length; i++) {
        const px = teamBStartX + i * (DRAW_SIZE + PLAYER_SPACING);
        const sprite = getCurrentSprite(teamBPlayers[i]);
        ctx.drawImage(sprite, px, spriteY, DRAW_SIZE, DRAW_SIZE);
    }
}

function tick(timestamp: number): void {
    const dt = lastTime === 0 ? 16 : timestamp - lastTime;
    lastTime = timestamp;

    for (const p of players) {
        updateAnimator(p, dt);
    }
    draw();

    animFrameId = requestAnimationFrame(tick);
}

export async function initSpriteRenderer(container: HTMLElement, playerList: PlayerInfo[]): Promise<void> {
    // Create canvas
    canvas = document.createElement('canvas');
    canvas.id = 'sprite-canvas';
    canvas.style.width = '100%';
    canvas.style.display = 'block';
    canvas.style.borderRadius = '8px';
    canvas.style.marginBottom = '0.5rem';

    // Set canvas resolution
    const containerWidth = container.clientWidth || 800;
    canvas.width = containerWidth;
    canvas.height = CANVAS_HEIGHT;

    ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.imageSmoothingEnabled = false;
    }

    container.prepend(canvas);

    // Handle resize
    const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
            if (canvas && ctx) {
                canvas.width = entry.contentRect.width;
                canvas.height = CANVAS_HEIGHT;
                ctx.imageSmoothingEnabled = false;
            }
        }
    });
    resizeObserver.observe(container);

    // Load background, rope, and all sprite sets
    function loadImage(src: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }

    const [bg, rope, blueNormal, redFlip] = await Promise.all([
        loadImage('/ropewar.png'),
        loadImage('/rope.svg'),
        loadSprites('blue', false),
        loadSprites('red', true),
    ]);

    bgImage = bg;

    // Rasterize SVG rope to an offscreen canvas so we can stretch freely
    const rasterW = 1600;
    const rasterH = 60;
    const offscreen = document.createElement('canvas');
    offscreen.width = rasterW;
    offscreen.height = rasterH;
    const offCtx = offscreen.getContext('2d');
    if (offCtx) {
        offCtx.drawImage(rope, 0, 0, rasterW, rasterH);
    }
    ropeBitmap = offscreen;

    blueSprites = blueNormal;
    redFlipSprites = redFlip;

    // Create per-player animators
    // Team A = blue, faces right (non-flipped)
    // Team B = red, faces left (flipped)
    players = playerList.map(p => {
        const sprites = p.team === 'a' ? blueSprites! : redFlipSprites!;
        return createAnimator(p.name, p.team, sprites);
    });

    ropePos = 0;
    lastTime = 0;
    animFrameId = requestAnimationFrame(tick);
}

export function updateSpriteRopePosition(position: number): void {
    ropePos = position;
}

export function triggerPullPlayer(playerName: string): void {
    const animator = findPlayer(playerName);
    if (!animator) return;

    if (animator.currentAnim === 'idle') {
        playAnim(animator, 'pull', {
            loop: false,
            onEnd: () => playAnim(animator, 'idle'),
        });
    }
}

export function triggerStumblePlayer(playerName: string, onEnd?: () => void): void {
    const animator = findPlayer(playerName);
    if (!animator) return;

    playAnim(animator, 'fall', { loop: false, onEnd: onEnd ?? null });
}

export function triggerRecoverPlayer(playerName: string, durationMs: number): void {
    const animator = findPlayer(playerName);
    if (!animator) return;

    const { sequence, frameDuration } = buildGetupSequence(durationMs);
    playAnim(animator, 'custom', {
        loop: false,
        customSequence: sequence,
        frameDuration,
        onEnd: () => playAnim(animator, 'idle'),
    });
}

export function triggerCelebrate(team: 'a' | 'b'): void {
    for (const p of getTeamPlayers(team)) {
        playAnim(p, 'celebrate');
    }
}

export function triggerFall(team: 'a' | 'b'): void {
    for (const p of getTeamPlayers(team)) {
        playAnim(p, 'fall', { loop: false });
    }
}

export function resetSprites(): void {
    for (const p of players) {
        playAnim(p, 'idle');
    }
    ropePos = 0;
}

export function destroySpriteRenderer(): void {
    if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
    }
    if (canvas && canvas.parentElement) {
        canvas.parentElement.removeChild(canvas);
    }
    canvas = null;
    ctx = null;
    players = [];
    bgImage = null;
    ropeBitmap = null;
    blueSprites = null;
    redFlipSprites = null;
    lastTime = 0;
}
