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

/**
  * Three sentences showcasing all three scripts:
  *
  *   私は、アニメが大好きです。
  *   "I love anime."
  *
  *   東京で、ラーメンを食べました。
  *   "I ate ramen in Tokyo."
  *
  *   コンピューターが上手になりたい。
  *   "I want to become good at computers."
  */
const SAMPLE_WORDS: JapaneseWord[] = [
    // --- 私は、アニメが大好きです。 ---

    // 私 (watashi) — "I"
    { kanji: '私', chars: [
        { romaji: 'wa', hiragana: 'わ', katakana: 'ワ' },
        { romaji: 'ta', hiragana: 'た', katakana: 'タ' },
        { romaji: 'shi', hiragana: 'し', katakana: 'シ' },
    ]},
    // は (wa) — topic particle (written は, pronounced wa)
    { kanji: 'は', chars: [
        { romaji: 'wa', hiragana: 'は', katakana: 'ハ' },
    ]},
    // 、 — Japanese comma
    { kanji: '、', chars: [{ romaji: ',', hiragana: '、', katakana: '、' }] },
    // アニメ (anime) — katakana loanword
    { kanji: 'ア', chars: [{ romaji: 'a', hiragana: 'あ', katakana: 'ア' }] },
    { kanji: 'ニ', chars: [{ romaji: 'ni', hiragana: 'に', katakana: 'ニ' }] },
    { kanji: 'メ', chars: [{ romaji: 'me', hiragana: 'め', katakana: 'メ' }] },
    // が (ga) — subject particle
    { kanji: 'が', chars: [
        { romaji: 'ga', hiragana: 'が', katakana: 'ガ' },
    ]},
    // 大好き (daisuki) — "love"
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
    // です (desu) — polite copula
    { kanji: 'で', chars: [{ romaji: 'de', hiragana: 'で', katakana: 'デ' }] },
    { kanji: 'す', chars: [{ romaji: 'su', hiragana: 'す', katakana: 'ス' }] },
    // 。 — Japanese period
    { kanji: '。', chars: [{ romaji: '.', hiragana: '。', katakana: '。' }] },

    // --- 東京で、ラーメンを食べました。 ---

    // 東京 (toukyou) — "Tokyo"
    { kanji: '東', chars: [
        { romaji: 'to', hiragana: 'と', katakana: 'ト' },
        { romaji: 'u', hiragana: 'う', katakana: 'ウ' },
    ]},
    { kanji: '京', chars: [
        { romaji: 'kyo', hiragana: 'きょ', katakana: 'キョ' },
        { romaji: 'u', hiragana: 'う', katakana: 'ウ' },
    ]},
    // で (de) — location particle
    { kanji: 'で', chars: [{ romaji: 'de', hiragana: 'で', katakana: 'デ' }] },
    // 、 — Japanese comma
    { kanji: '、', chars: [{ romaji: ',', hiragana: '、', katakana: '、' }] },
    // ラーメン (raamen) — "ramen", katakana loanword
    // ー extends the vowel of ラ (ra → raa), so romaji is 'a'.
    { kanji: 'ラ', chars: [{ romaji: 'ra', hiragana: 'ら', katakana: 'ラ' }] },
    { kanji: 'ー', chars: [{ romaji: 'a', hiragana: 'あ', katakana: 'ー' }] },
    { kanji: 'メ', chars: [{ romaji: 'me', hiragana: 'め', katakana: 'メ' }] },
    { kanji: 'ン', chars: [{ romaji: 'n', hiragana: 'ん', katakana: 'ン' }] },
    // を (wo) — object particle
    { kanji: 'を', chars: [
        { romaji: 'wo', hiragana: 'を', katakana: 'ヲ' },
    ]},
    // 食べました (tabemashita) — "ate" (past polite)
    { kanji: '食', chars: [
        { romaji: 'ta', hiragana: 'た', katakana: 'タ' },
    ]},
    { kanji: 'べ', chars: [{ romaji: 'be', hiragana: 'べ', katakana: 'ベ' }] },
    { kanji: 'ま', chars: [{ romaji: 'ma', hiragana: 'ま', katakana: 'マ' }] },
    { kanji: 'し', chars: [{ romaji: 'shi', hiragana: 'し', katakana: 'シ' }] },
    { kanji: 'た', chars: [{ romaji: 'ta', hiragana: 'た', katakana: 'タ' }] },
    // 。 — Japanese period
    { kanji: '。', chars: [{ romaji: '.', hiragana: '。', katakana: '。' }] },

    // --- コンピューターが上手になりたい。 ---

    // コンピューター (konpyuutaa) — "computer", katakana loanword
    { kanji: 'コ', chars: [{ romaji: 'ko', hiragana: 'こ', katakana: 'コ' }] },
    { kanji: 'ン', chars: [{ romaji: 'n', hiragana: 'ん', katakana: 'ン' }] },
    // ピュ is a combined sound (pi + small yu = pyu)
    { kanji: 'ピュ', chars: [{ romaji: 'pyu', hiragana: 'ぴゅ', katakana: 'ピュ' }] },
    // ー extends the vowel of ピュ (pyu → pyuu), so romaji is 'u'.
    { kanji: 'ー', chars: [{ romaji: 'u', hiragana: 'う', katakana: 'ー' }] },
    { kanji: 'タ', chars: [{ romaji: 'ta', hiragana: 'た', katakana: 'タ' }] },
    // ー extends the vowel of タ (ta → taa), so romaji is 'a'.
    { kanji: 'ー', chars: [{ romaji: 'a', hiragana: 'あ', katakana: 'ー' }] },
    // が (ga) — subject particle
    { kanji: 'が', chars: [{ romaji: 'ga', hiragana: 'が', katakana: 'ガ' }] },
    // 上手 (jouzu) — "skilled"
    { kanji: '上', chars: [
        { romaji: 'jo', hiragana: 'じょ', katakana: 'ジョ' },
        { romaji: 'u', hiragana: 'う', katakana: 'ウ' },
    ]},
    { kanji: '手', chars: [
        { romaji: 'zu', hiragana: 'ず', katakana: 'ズ' },
    ]},
    // になりたい (ni naritai) — "want to become"
    { kanji: 'に', chars: [{ romaji: 'ni', hiragana: 'に', katakana: 'ニ' }] },
    { kanji: 'な', chars: [{ romaji: 'na', hiragana: 'な', katakana: 'ナ' }] },
    { kanji: 'り', chars: [{ romaji: 'ri', hiragana: 'り', katakana: 'リ' }] },
    { kanji: 'た', chars: [{ romaji: 'ta', hiragana: 'た', katakana: 'タ' }] },
    { kanji: 'い', chars: [{ romaji: 'i', hiragana: 'い', katakana: 'イ' }] },
    // 。 — Japanese period
    { kanji: '。', chars: [{ romaji: '.', hiragana: '。', katakana: '。' }] },
];

// ---------------------------------------------------------------------------
// Conversion to GlyphText[]
// ---------------------------------------------------------------------------

/**
  * Convert the sample data to GlyphText[] for a given script mode.
  *
  * - Hiragana: each character becomes its own glyph (e.g. わ→wa, た→ta, し→shi).
  * - Katakana: same but with katakana characters (ワ→wa, タ→ta, シ→shi).
  * - Kanji (mixed): each word becomes one glyph with its full romaji
  *   (e.g. 私→watashi, 東→tou). This is how natural Japanese is written.
  */
export function japaneseSample(mode: JapaneseMode): GlyphText[] {
    if (mode === 'hiragana') {
        return SAMPLE_WORDS.flatMap((word) =>
            word.chars.map((ch) => ({ glyph: ch.hiragana, romanized: ch.romaji })),
        );
    }

    if (mode === 'katakana') {
        return SAMPLE_WORDS.flatMap((word) =>
            word.chars.map((ch) => ({ glyph: ch.katakana, romanized: ch.romaji })),
        );
    }

    // Kanji (mixed) mode: one glyph per word, romaji = all chars joined.
    return SAMPLE_WORDS.map((word) => ({
        glyph: word.kanji,
        romanized: word.chars.map((ch) => ch.romaji).join(''),
    }));
}

/**
  * Get the native text string for display (e.g. in session results).
  */
export function japaneseSourceText(mode: JapaneseMode): string {
    if (mode === 'kanji') {
        return SAMPLE_WORDS.map((w) => w.kanji).join('');
    }
    if (mode === 'hiragana') {
        return SAMPLE_WORDS.flatMap((w) => w.chars.map((c) => c.hiragana)).join('');
    }
    return SAMPLE_WORDS.flatMap((w) => w.chars.map((c) => c.katakana)).join('');
}
