import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const textsPath = join(__dirname, '..', 'data', 'texts.json');

let cachedTexts: string[] | null = null;

function loadTexts(): string[] {
    if (cachedTexts === null) {
        const raw = readFileSync(textsPath, 'utf-8');
        cachedTexts = JSON.parse(raw) as string[];
    }
    return cachedTexts;
}

/** Fisher-Yates shuffle — returns a new shuffled array. */
export function getShuffledTextPool(): string[] {
    const texts = [...loadTexts()];
    for (let i = texts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [texts[i], texts[j]] = [texts[j], texts[i]];
    }
    return texts;
}
