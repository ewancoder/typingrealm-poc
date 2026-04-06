/**
  * Chinese (Mandarin) sample data — hanzi characters with pinyin romanization.
  *
  * Chinese is simpler than Japanese in one way: it's all hanzi (no script
  * mixing). Each character maps to exactly one pinyin syllable in context.
  *
  * We use plain pinyin without tone marks — the user types latin characters
  * and the engine matches against the expected pinyin. Tone-aware input
  * (e.g. typing tone numbers like "wo3") is a future extension.
  */

import type { GlyphText } from './cjk-text-provider.js';

/**
  * Three sentences showcasing common characters and pinyin:
  *
  *   我喜欢学习中文
  *   "I like studying Chinese"
  *
  *   今天天气很好
  *   "Today's weather is great"
  *
  *   北京是中国的首都
  *   "Beijing is the capital of China"
  */
export const SAMPLE_CHINESE: GlyphText[] = [
    // 我喜欢学习中文 — "I like studying Chinese"
    { glyph: '我', romanized: 'wo' },
    { glyph: '喜', romanized: 'xi' },
    { glyph: '欢', romanized: 'huan' },
    { glyph: '学', romanized: 'xue' },
    { glyph: '习', romanized: 'xi' },
    { glyph: '中', romanized: 'zhong' },
    { glyph: '文', romanized: 'wen' },

    // 今天天气很好 — "Today's weather is great"
    { glyph: '今', romanized: 'jin' },
    { glyph: '天', romanized: 'tian' },
    { glyph: '天', romanized: 'tian' },
    { glyph: '气', romanized: 'qi' },
    { glyph: '很', romanized: 'hen' },
    { glyph: '好', romanized: 'hao' },

    // 北京是中国的首都 — "Beijing is the capital of China"
    { glyph: '北', romanized: 'bei' },
    { glyph: '京', romanized: 'jing' },
    { glyph: '是', romanized: 'shi' },
    { glyph: '中', romanized: 'zhong' },
    { glyph: '国', romanized: 'guo' },
    { glyph: '的', romanized: 'de' },
    { glyph: '首', romanized: 'shou' },
    { glyph: '都', romanized: 'du' },
];
