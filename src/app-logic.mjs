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

export function getKoreanVoices(voices = []) {
  return voices
    .map((voice, index) => ({ voice, index }))
    .filter(({ voice }) => String(voice.lang || '').toLowerCase().replace('_', '-').startsWith('ko'))
    .map(({ voice, index }) => {
      const name = voice.name || `Korean Voice ${index}`;
      const lang = voice.lang || 'ko-KR';
      return {
        index,
        name,
        lang,
        label: `${name} — ${lang}`,
      };
    });
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
