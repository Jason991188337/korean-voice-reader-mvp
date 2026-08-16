export function cleanKoreanText(input = '') {
  return String(input)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/([가-힣])\s*\n+\s*([가-힣])/g, '$1$2')
    .replace(/\n{2,}/g, '\n')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s+([,.!?;:。！？])/g, '$1')
    .trim();
}

const RECOMMENDED_KOREAN_VOICE_RANKS = [
  'yuna',
  'google',
  'flo',
  'shelley',
  'sandy',
  'grandma',
  'grandpa',
  'eddy',
  'reed',
  'rocko',
];

function recommendedVoiceRank(name) {
  const normalized = String(name || '').toLowerCase();
  const rank = RECOMMENDED_KOREAN_VOICE_RANKS.findIndex((keyword) => normalized.includes(keyword));
  return rank === -1 ? Number.POSITIVE_INFINITY : rank;
}

export function getKoreanVoices(voices = []) {
  return voices
    .map((voice, index) => ({ voice, index, rank: recommendedVoiceRank(voice.name) }))
    .filter(({ voice, rank }) => {
      const lang = String(voice.lang || '').toLowerCase().replace('_', '-');
      return lang.startsWith('ko') && Number.isFinite(rank);
    })
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, 10)
    .map(({ voice, index }) => {
      const name = voice.name || `Korean Voice ${index}`;
      const lang = voice.lang || 'ko-KR';
      return {
        index,
        name,
        lang,
        label: `${name} — ${lang}`,
        type: 'browser',
      };
    });
}

export function getPlayableVoiceOptions(voices = []) {
  const available = getKoreanVoices(voices);
  const yuna = available.find((voice) => voice.name.toLowerCase().includes('yuna')) ||
    { index: null, name: 'Yuna', lang: 'ko-KR', label: 'Yuna — ko-KR', type: 'fallback-yuna' };
  const google = available.find((voice) => voice.name.toLowerCase().includes('google')) ||
    { index: null, name: 'Google Korean', lang: 'ko-KR', label: 'Google Korean — ko-KR', type: 'fallback-google' };
  const extras = available.filter((voice) => {
    const name = voice.name.toLowerCase();
    return !name.includes('yuna') && !name.includes('google');
  });

  return [yuna, google, ...extras];
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

export function buildSpeechUtteranceConfig({ text, rate = 1, pitch = 1, voiceIndex = '' } = {}) {
  const parsedVoiceIndex = voiceIndex === '' || voiceIndex === undefined ? null : Number(voiceIndex);

  return {
    text: cleanKoreanText(text),
    lang: 'ko-KR',
    rate: clampNumber(rate, 0.5, 2, 1),
    pitch: clampNumber(pitch, 0, 2, 1),
    voiceIndex: Number.isInteger(parsedVoiceIndex) ? parsedVoiceIndex : null,
  };
}

function splitTextIntoChunks(text, maxChars) {
  const normalized = cleanKoreanText(text);
  if (!normalized) return [];

  const sentences = normalized.match(/[^.!?。！？]+[.!?。！？]?/g) || [normalized];
  const chunks = [];
  let current = '';

  for (const sentence of sentences.map((item) => item.trim()).filter(Boolean)) {
    if ((current + ' ' + sentence).trim().length <= maxChars) {
      current = (current + ' ' + sentence).trim();
      continue;
    }
    if (current) chunks.push(current);

    if (sentence.length <= maxChars) {
      current = sentence;
    } else {
      for (let i = 0; i < sentence.length; i += maxChars) {
        chunks.push(sentence.slice(i, i + maxChars));
      }
      current = '';
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

export function buildGoogleTtsMp3Links(text, { maxChars = 180 } = {}) {
  return splitTextIntoChunks(text, maxChars).map((chunk, index) => {
    const params = new URLSearchParams({
      ie: 'UTF-8',
      q: chunk,
      tl: 'ko',
      client: 'tw-ob',
    });

    return {
      text: chunk,
      filename: `korean-voice-part-${index + 1}.mp3`,
      url: `https://translate.google.com/translate_tts?${params.toString()}`,
    };
  });
}

export function estimateSpeechDurationMs(text, rate = 1) {
  const normalized = cleanKoreanText(text);
  if (!normalized) return 0;

  const safeRate = clampNumber(rate, 0.5, 2, 1);
  const koreanChars = (normalized.match(/[가-힣]/g) || []).length;
  const otherChars = normalized.replace(/[가-힣\s]/g, '').length;
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const estimatedSeconds = Math.max(2, (koreanChars * 0.16 + otherChars * 0.08 + wordCount * 0.18) / safeRate);
  return Math.round(estimatedSeconds * 1000);
}

export function calculatePlaybackProgress({ startedAt, now, durationMs }) {
  if (!durationMs || durationMs <= 0) return 0;
  const elapsed = Math.max(0, now - startedAt);
  const percentage = Math.round((elapsed / durationMs) * 100);
  return Math.min(100, Math.max(0, percentage));
}

export function getTextFromProgress(text, progress) {
  const normalized = cleanKoreanText(text);
  if (!normalized) return '';

  const safeProgress = Math.min(100, Math.max(0, Number(progress) || 0));
  const index = Math.min(normalized.length - 1, Math.floor((safeProgress / 100) * normalized.length));
  return normalized.slice(index);
}
