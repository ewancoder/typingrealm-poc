/**
  * Japanese sample data with all three script representations.
  *
  * Each "word" has:
  *   - kanji: the natural mixed-script display (kanji for content words,
  *     hiragana for particles, katakana for loanwords).
  *   - chars: per-character breakdown with hiragana, katakana, and romaji.
  *
  * This lets us show the SAME sentence in three ways:
  *   - Hiragana mode: each char.hiragana → its own glyph.
  *   - Katakana mode: each char.katakana → its own glyph.
  *   - Kanji (mixed) mode: word.kanji → one glyph, romaji = all chars joined.
  *
  * Combined kana (きょ, ピュ, etc.) are treated as single glyphs with their
  * combined romaji — this matches how romaji input actually works.
  */

import type { GlyphText } from './cjk-text-provider.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JapaneseChar {
    romaji: string;
    hiragana: string;
    katakana: string;
}

interface JapaneseWord {
    /** Display glyph in mixed/kanji mode (natural Japanese writing). */
    kanji: string;
    /** Character-level breakdown for hiragana/katakana modes. */
    chars: JapaneseChar[];
}

export type JapaneseMode = 'hiragana' | 'katakana' | 'kanji';

// ---------------------------------------------------------------------------
// Sample sentences
// ---------------------------------------------------------------------------

const JAPANESE_SENTENCES: JapaneseWord[][] = [

    // ── 1. 私は、アニメが大好きです。 ──
    // "I love anime."
    [
        { kanji: '私', chars: [
            { romaji: 'wa', hiragana: 'わ', katakana: 'ワ' },
            { romaji: 'ta', hiragana: 'た', katakana: 'タ' },
            { romaji: 'shi', hiragana: 'し', katakana: 'シ' },
        ]},
        { kanji: 'は', chars: [
            { romaji: 'wa', hiragana: 'は', katakana: 'ハ' },
        ]},
        { kanji: '、', chars: [{ romaji: ',', hiragana: '、', katakana: '、' }] },
        { kanji: 'ア', chars: [{ romaji: 'a', hiragana: 'あ', katakana: 'ア' }] },
        { kanji: 'ニ', chars: [{ romaji: 'ni', hiragana: 'に', katakana: 'ニ' }] },
        { kanji: 'メ', chars: [{ romaji: 'me', hiragana: 'め', katakana: 'メ' }] },
        { kanji: 'が', chars: [
            { romaji: 'ga', hiragana: 'が', katakana: 'ガ' },
        ]},
        { kanji: '大', chars: [
            { romaji: 'da', hiragana: 'だ', katakana: 'ダ' },
            { romaji: 'i', hiragana: 'い', katakana: 'イ' },
        ]},
        { kanji: '好', chars: [
            { romaji: 'su', hiragana: 'す', katakana: 'ス' },
        ]},
        { kanji: 'き', chars: [
            { romaji: 'ki', hiragana: 'き', katakana: 'キ' },
        ]},
        { kanji: 'で', chars: [{ romaji: 'de', hiragana: 'で', katakana: 'デ' }] },
        { kanji: 'す', chars: [{ romaji: 'su', hiragana: 'す', katakana: 'ス' }] },
        { kanji: '。', chars: [{ romaji: '.', hiragana: '。', katakana: '。' }] },
    ],

    // ── 2. 東京で、ラーメンを食べました。 ──
    // "I ate ramen in Tokyo."
    [
        { kanji: '東', chars: [
            { romaji: 'to', hiragana: 'と', katakana: 'ト' },
            { romaji: 'u', hiragana: 'う', katakana: 'ウ' },
        ]},
        { kanji: '京', chars: [
            { romaji: 'kyo', hiragana: 'きょ', katakana: 'キョ' },
            { romaji: 'u', hiragana: 'う', katakana: 'ウ' },
        ]},
        { kanji: 'で', chars: [{ romaji: 'de', hiragana: 'で', katakana: 'デ' }] },
        { kanji: '、', chars: [{ romaji: ',', hiragana: '、', katakana: '、' }] },
        { kanji: 'ラ', chars: [{ romaji: 'ra', hiragana: 'ら', katakana: 'ラ' }] },
        { kanji: 'ー', chars: [{ romaji: 'a', hiragana: 'あ', katakana: 'ー' }] },
        { kanji: 'メ', chars: [{ romaji: 'me', hiragana: 'め', katakana: 'メ' }] },
        { kanji: 'ン', chars: [{ romaji: 'n', hiragana: 'ん', katakana: 'ン' }] },
        { kanji: 'を', chars: [
            { romaji: 'wo', hiragana: 'を', katakana: 'ヲ' },
        ]},
        { kanji: '食', chars: [
            { romaji: 'ta', hiragana: 'た', katakana: 'タ' },
        ]},
        { kanji: 'べ', chars: [{ romaji: 'be', hiragana: 'べ', katakana: 'ベ' }] },
        { kanji: 'ま', chars: [{ romaji: 'ma', hiragana: 'ま', katakana: 'マ' }] },
        { kanji: 'し', chars: [{ romaji: 'shi', hiragana: 'し', katakana: 'シ' }] },
        { kanji: 'た', chars: [{ romaji: 'ta', hiragana: 'た', katakana: 'タ' }] },
        { kanji: '。', chars: [{ romaji: '.', hiragana: '。', katakana: '。' }] },
    ],

    // ── 3. コンピューターが上手になりたい。 ──
    // "I want to become good at computers."
    [
        { kanji: 'コ', chars: [{ romaji: 'ko', hiragana: 'こ', katakana: 'コ' }] },
        { kanji: 'ン', chars: [{ romaji: 'n', hiragana: 'ん', katakana: 'ン' }] },
        { kanji: 'ピュ', chars: [{ romaji: 'pyu', hiragana: 'ぴゅ', katakana: 'ピュ' }] },
        { kanji: 'ー', chars: [{ romaji: 'u', hiragana: 'う', katakana: 'ー' }] },
        { kanji: 'タ', chars: [{ romaji: 'ta', hiragana: 'た', katakana: 'タ' }] },
        { kanji: 'ー', chars: [{ romaji: 'a', hiragana: 'あ', katakana: 'ー' }] },
        { kanji: 'が', chars: [{ romaji: 'ga', hiragana: 'が', katakana: 'ガ' }] },
        { kanji: '上', chars: [
            { romaji: 'jo', hiragana: 'じょ', katakana: 'ジョ' },
            { romaji: 'u', hiragana: 'う', katakana: 'ウ' },
        ]},
        { kanji: '手', chars: [
            { romaji: 'zu', hiragana: 'ず', katakana: 'ズ' },
        ]},
        { kanji: 'に', chars: [{ romaji: 'ni', hiragana: 'に', katakana: 'ニ' }] },
        { kanji: 'な', chars: [{ romaji: 'na', hiragana: 'な', katakana: 'ナ' }] },
        { kanji: 'り', chars: [{ romaji: 'ri', hiragana: 'り', katakana: 'リ' }] },
        { kanji: 'た', chars: [{ romaji: 'ta', hiragana: 'た', katakana: 'タ' }] },
        { kanji: 'い', chars: [{ romaji: 'i', hiragana: 'い', katakana: 'イ' }] },
        { kanji: '。', chars: [{ romaji: '.', hiragana: '。', katakana: '。' }] },
    ],

    // ── 4. 今日は、天気がいいですね。 ──
    // "The weather is nice today, isn't it?"
    [
        { kanji: '今', chars: [
            { romaji: 'kyo', hiragana: 'きょ', katakana: 'キョ' },
        ]},
        { kanji: '日', chars: [
            { romaji: 'u', hiragana: 'う', katakana: 'ウ' },
        ]},
        { kanji: 'は', chars: [{ romaji: 'wa', hiragana: 'は', katakana: 'ハ' }] },
        { kanji: '、', chars: [{ romaji: ',', hiragana: '、', katakana: '、' }] },
        { kanji: '天', chars: [
            { romaji: 'te', hiragana: 'て', katakana: 'テ' },
            { romaji: 'n', hiragana: 'ん', katakana: 'ン' },
        ]},
        { kanji: '気', chars: [
            { romaji: 'ki', hiragana: 'き', katakana: 'キ' },
        ]},
        { kanji: 'が', chars: [{ romaji: 'ga', hiragana: 'が', katakana: 'ガ' }] },
        { kanji: 'い', chars: [{ romaji: 'i', hiragana: 'い', katakana: 'イ' }] },
        { kanji: 'い', chars: [{ romaji: 'i', hiragana: 'い', katakana: 'イ' }] },
        { kanji: 'で', chars: [{ romaji: 'de', hiragana: 'で', katakana: 'デ' }] },
        { kanji: 'す', chars: [{ romaji: 'su', hiragana: 'す', katakana: 'ス' }] },
        { kanji: 'ね', chars: [{ romaji: 'ne', hiragana: 'ね', katakana: 'ネ' }] },
        { kanji: '。', chars: [{ romaji: '.', hiragana: '。', katakana: '。' }] },
    ],

    // ── 5. 日本語を、毎日勉強しています。 ──
    // "I study Japanese every day."
    [
        { kanji: '日', chars: [
            { romaji: 'ni', hiragana: 'に', katakana: 'ニ' },
        ]},
        { kanji: '本', chars: [
            { romaji: 'ho', hiragana: 'ほ', katakana: 'ホ' },
            { romaji: 'n', hiragana: 'ん', katakana: 'ン' },
        ]},
        { kanji: '語', chars: [
            { romaji: 'go', hiragana: 'ご', katakana: 'ゴ' },
        ]},
        { kanji: 'を', chars: [{ romaji: 'wo', hiragana: 'を', katakana: 'ヲ' }] },
        { kanji: '、', chars: [{ romaji: ',', hiragana: '、', katakana: '、' }] },
        { kanji: '毎', chars: [
            { romaji: 'ma', hiragana: 'ま', katakana: 'マ' },
            { romaji: 'i', hiragana: 'い', katakana: 'イ' },
        ]},
        { kanji: '日', chars: [
            { romaji: 'ni', hiragana: 'に', katakana: 'ニ' },
            { romaji: 'chi', hiragana: 'ち', katakana: 'チ' },
        ]},
        { kanji: '勉', chars: [
            { romaji: 'be', hiragana: 'べ', katakana: 'ベ' },
            { romaji: 'n', hiragana: 'ん', katakana: 'ン' },
        ]},
        { kanji: '強', chars: [
            { romaji: 'kyo', hiragana: 'きょ', katakana: 'キョ' },
            { romaji: 'u', hiragana: 'う', katakana: 'ウ' },
        ]},
        { kanji: 'し', chars: [{ romaji: 'shi', hiragana: 'し', katakana: 'シ' }] },
        { kanji: 'て', chars: [{ romaji: 'te', hiragana: 'て', katakana: 'テ' }] },
        { kanji: 'い', chars: [{ romaji: 'i', hiragana: 'い', katakana: 'イ' }] },
        { kanji: 'ま', chars: [{ romaji: 'ma', hiragana: 'ま', katakana: 'マ' }] },
        { kanji: 'す', chars: [{ romaji: 'su', hiragana: 'す', katakana: 'ス' }] },
        { kanji: '。', chars: [{ romaji: '.', hiragana: '。', katakana: '。' }] },
    ],

    // ── 6. 新しいゲームをダウンロードした。 ──
    // "I downloaded a new game."
    [
        { kanji: '新', chars: [
            { romaji: 'a', hiragana: 'あ', katakana: 'ア' },
            { romaji: 'ta', hiragana: 'た', katakana: 'タ' },
            { romaji: 'ra', hiragana: 'ら', katakana: 'ラ' },
        ]},
        { kanji: 'し', chars: [{ romaji: 'shi', hiragana: 'し', katakana: 'シ' }] },
        { kanji: 'い', chars: [{ romaji: 'i', hiragana: 'い', katakana: 'イ' }] },
        { kanji: 'ゲ', chars: [{ romaji: 'ge', hiragana: 'げ', katakana: 'ゲ' }] },
        { kanji: 'ー', chars: [{ romaji: 'e', hiragana: 'え', katakana: 'ー' }] },
        { kanji: 'ム', chars: [{ romaji: 'mu', hiragana: 'む', katakana: 'ム' }] },
        { kanji: 'を', chars: [{ romaji: 'wo', hiragana: 'を', katakana: 'ヲ' }] },
        { kanji: 'ダ', chars: [{ romaji: 'da', hiragana: 'だ', katakana: 'ダ' }] },
        { kanji: 'ウ', chars: [{ romaji: 'u', hiragana: 'う', katakana: 'ウ' }] },
        { kanji: 'ン', chars: [{ romaji: 'n', hiragana: 'ん', katakana: 'ン' }] },
        { kanji: 'ロ', chars: [{ romaji: 'ro', hiragana: 'ろ', katakana: 'ロ' }] },
        { kanji: 'ー', chars: [{ romaji: 'o', hiragana: 'お', katakana: 'ー' }] },
        { kanji: 'ド', chars: [{ romaji: 'do', hiragana: 'ど', katakana: 'ド' }] },
        { kanji: 'し', chars: [{ romaji: 'shi', hiragana: 'し', katakana: 'シ' }] },
        { kanji: 'た', chars: [{ romaji: 'ta', hiragana: 'た', katakana: 'タ' }] },
        { kanji: '。', chars: [{ romaji: '.', hiragana: '。', katakana: '。' }] },
    ],

    // ── 7. 友達と、映画を見に行きました。 ──
    // "I went to see a movie with friends."
    [
        { kanji: '友', chars: [
            { romaji: 'to', hiragana: 'と', katakana: 'ト' },
            { romaji: 'mo', hiragana: 'も', katakana: 'モ' },
        ]},
        { kanji: '達', chars: [
            { romaji: 'da', hiragana: 'だ', katakana: 'ダ' },
            { romaji: 'chi', hiragana: 'ち', katakana: 'チ' },
        ]},
        { kanji: 'と', chars: [{ romaji: 'to', hiragana: 'と', katakana: 'ト' }] },
        { kanji: '、', chars: [{ romaji: ',', hiragana: '、', katakana: '、' }] },
        { kanji: '映', chars: [
            { romaji: 'e', hiragana: 'え', katakana: 'エ' },
            { romaji: 'i', hiragana: 'い', katakana: 'イ' },
        ]},
        { kanji: '画', chars: [
            { romaji: 'ga', hiragana: 'が', katakana: 'ガ' },
        ]},
        { kanji: 'を', chars: [{ romaji: 'wo', hiragana: 'を', katakana: 'ヲ' }] },
        { kanji: '見', chars: [
            { romaji: 'mi', hiragana: 'み', katakana: 'ミ' },
        ]},
        { kanji: 'に', chars: [{ romaji: 'ni', hiragana: 'に', katakana: 'ニ' }] },
        { kanji: '行', chars: [
            { romaji: 'i', hiragana: 'い', katakana: 'イ' },
        ]},
        { kanji: 'き', chars: [{ romaji: 'ki', hiragana: 'き', katakana: 'キ' }] },
        { kanji: 'ま', chars: [{ romaji: 'ma', hiragana: 'ま', katakana: 'マ' }] },
        { kanji: 'し', chars: [{ romaji: 'shi', hiragana: 'し', katakana: 'シ' }] },
        { kanji: 'た', chars: [{ romaji: 'ta', hiragana: 'た', katakana: 'タ' }] },
        { kanji: '。', chars: [{ romaji: '.', hiragana: '。', katakana: '。' }] },
    ],

    // ── 8. 猫が窓の外を見ている。 ──
    // "The cat is looking outside the window."
    [
        { kanji: '猫', chars: [
            { romaji: 'ne', hiragana: 'ね', katakana: 'ネ' },
            { romaji: 'ko', hiragana: 'こ', katakana: 'コ' },
        ]},
        { kanji: 'が', chars: [{ romaji: 'ga', hiragana: 'が', katakana: 'ガ' }] },
        { kanji: '窓', chars: [
            { romaji: 'ma', hiragana: 'ま', katakana: 'マ' },
            { romaji: 'do', hiragana: 'ど', katakana: 'ド' },
        ]},
        { kanji: 'の', chars: [{ romaji: 'no', hiragana: 'の', katakana: 'ノ' }] },
        { kanji: '外', chars: [
            { romaji: 'so', hiragana: 'そ', katakana: 'ソ' },
            { romaji: 'to', hiragana: 'と', katakana: 'ト' },
        ]},
        { kanji: 'を', chars: [{ romaji: 'wo', hiragana: 'を', katakana: 'ヲ' }] },
        { kanji: '見', chars: [
            { romaji: 'mi', hiragana: 'み', katakana: 'ミ' },
        ]},
        { kanji: 'て', chars: [{ romaji: 'te', hiragana: 'て', katakana: 'テ' }] },
        { kanji: 'い', chars: [{ romaji: 'i', hiragana: 'い', katakana: 'イ' }] },
        { kanji: 'る', chars: [{ romaji: 'ru', hiragana: 'る', katakana: 'ル' }] },
        { kanji: '。', chars: [{ romaji: '.', hiragana: '。', katakana: '。' }] },
    ],
];

// ---------------------------------------------------------------------------
// Conversion to GlyphText[]
// ---------------------------------------------------------------------------

function wordsToGlyphs(words: JapaneseWord[], mode: JapaneseMode): GlyphText[] {
    if (mode === 'hiragana') {
        return words.flatMap((word) =>
            word.chars.map((ch) => ({ glyph: ch.hiragana, romanized: ch.romaji })),
        );
    }

    if (mode === 'katakana') {
        return words.flatMap((word) =>
            word.chars.map((ch) => ({ glyph: ch.katakana, romanized: ch.romaji })),
        );
    }

    // Kanji (mixed) mode: one glyph per word, romaji = all chars joined.
    return words.map((word) => ({
        glyph: word.kanji,
        romanized: word.chars.map((ch) => ch.romaji).join(''),
    }));
}

function wordsToSourceText(words: JapaneseWord[], mode: JapaneseMode): string {
    if (mode === 'kanji') {
        return words.map((w) => w.kanji).join('');
    }
    if (mode === 'hiragana') {
        return words.flatMap((w) => w.chars.map((c) => c.hiragana)).join('');
    }
    return words.flatMap((w) => w.chars.map((c) => c.katakana)).join('');
}

/**
  * Convert ALL sample sentences (combined) to GlyphText[] for a given mode.
  * Used by the main training page.
  */
export function japaneseSample(mode: JapaneseMode): GlyphText[] {
    const allWords = JAPANESE_SENTENCES.flat();
    return wordsToGlyphs(allWords, mode);
}

/**
  * Get the native text string for ALL sentences combined.
  */
export function japaneseSourceText(mode: JapaneseMode): string {
    const allWords = JAPANESE_SENTENCES.flat();
    return wordsToSourceText(allWords, mode);
}

/**
  * Number of individual Japanese sentences available.
  */
export function japaneseSentenceCount(): number {
    return JAPANESE_SENTENCES.length;
}

/**
  * Get a single sentence as GlyphText[] by index.
  */
export function japaneseSentenceAt(mode: JapaneseMode, index: number): GlyphText[] {
    const sentence = JAPANESE_SENTENCES[index % JAPANESE_SENTENCES.length];
    return wordsToGlyphs(sentence, mode);
}

/**
  * Get the native text string for a single sentence by index.
  */
export function japaneseSentenceSourceText(mode: JapaneseMode, index: number): string {
    const sentence = JAPANESE_SENTENCES[index % JAPANESE_SENTENCES.length];
    return wordsToSourceText(sentence, mode);
}
