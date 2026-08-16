import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cleanKoreanText,
  getKoreanVoices,
  buildSpeechUtteranceConfig,
} from '../src/app-logic.mjs';

test('cleanKoreanText normalizes OCR whitespace while preserving Korean punctuation', () => {
  const raw = '  안녕\n\n하세요   세계 !  \n오늘은   좋은 날입니다.  ';
  assert.equal(cleanKoreanText(raw), '안녕하세요 세계! 오늘은 좋은 날입니다.');
});

test('getKoreanVoices returns Korean voices first with stable fallback labels', () => {
  const voices = [
    { name: 'Alex', lang: 'en-US' },
    { name: 'Yuna', lang: 'ko-KR' },
    { name: '', lang: 'ko_KR' },
    { name: 'Kyoko', lang: 'ja-JP' },
  ];

  assert.deepEqual(getKoreanVoices(voices), [
    { index: 1, name: 'Yuna', lang: 'ko-KR', label: 'Yuna — ko-KR' },
    { index: 2, name: 'Korean Voice 2', lang: 'ko_KR', label: 'Korean Voice 2 — ko_KR' },
  ]);
});

test('buildSpeechUtteranceConfig clamps speech controls and defaults to Korean', () => {
  assert.deepEqual(
    buildSpeechUtteranceConfig({ text: '테스트', rate: 99, pitch: -3, voiceIndex: '2' }),
    { text: '테스트', lang: 'ko-KR', rate: 2, pitch: 0, voiceIndex: 2 }
  );
});
