import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cleanKoreanText,
  getKoreanVoices,
  buildSpeechUtteranceConfig,
  buildGoogleTtsMp3Links,
} from '../src/app-logic.mjs';

test('cleanKoreanText normalizes OCR whitespace while preserving Korean punctuation', () => {
  const raw = '  안녕\n\n하세요   세계 !  \n오늘은   좋은 날입니다.  ';
  assert.equal(cleanKoreanText(raw), '안녕하세요 세계! 오늘은 좋은 날입니다.');
});

test('getKoreanVoices only keeps Yuna and Google Korean voices', () => {
  const voices = [
    { name: 'Alex', lang: 'en-US' },
    { name: 'Eddy (Korean (South Korea))', lang: 'ko-KR' },
    { name: 'Yuna', lang: 'ko-KR' },
    { name: 'Google 한국의', lang: 'ko-KR' },
    { name: 'Google US English', lang: 'en-US' },
    { name: 'Kyoko', lang: 'ja-JP' },
  ];

  assert.deepEqual(getKoreanVoices(voices), [
    { index: 2, name: 'Yuna', lang: 'ko-KR', label: 'Yuna — ko-KR' },
    { index: 3, name: 'Google 한국의', lang: 'ko-KR', label: 'Google 한국의 — ko-KR' },
  ]);
});

test('buildSpeechUtteranceConfig clamps speech controls and defaults to Korean', () => {
  assert.deepEqual(
    buildSpeechUtteranceConfig({ text: '테스트', rate: 99, pitch: -3, voiceIndex: '2' }),
    { text: '테스트', lang: 'ko-KR', rate: 2, pitch: 0, voiceIndex: 2 }
  );
});

test('buildGoogleTtsMp3Links creates encoded Korean MP3 links in short chunks', () => {
  const links = buildGoogleTtsMp3Links('안녕하세요. '.repeat(30), { maxChars: 80 });
  assert.ok(links.length > 1);
  assert.equal(links[0].filename, 'korean-voice-part-1.mp3');
  assert.match(links[0].url, /^https:\/\/translate\.google\.com\/translate_tts\?/);
  assert.match(links[0].url, /tl=ko/);
  assert.match(links[0].url, /client=tw-ob/);
  assert.ok(decodeURIComponent(links[0].url).includes('안녕하세요'));
});
