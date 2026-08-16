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

test('getKoreanVoices keeps up to 10 recommended Korean voices in ranked order', () => {
  const voices = [
    { name: 'Alex', lang: 'en-US' },
    { name: 'Eddy (Korean (South Korea))', lang: 'ko-KR' },
    { name: 'Flo (Korean (South Korea))', lang: 'ko-KR' },
    { name: 'Grandma (Korean (South Korea))', lang: 'ko-KR' },
    { name: 'Grandpa (Korean (South Korea))', lang: 'ko-KR' },
    { name: 'Reed (Korean (South Korea))', lang: 'ko-KR' },
    { name: 'Rocko (Korean (South Korea))', lang: 'ko-KR' },
    { name: 'Sandy (Korean (South Korea))', lang: 'ko-KR' },
    { name: 'Shelley (Korean (South Korea))', lang: 'ko-KR' },
    { name: 'Yuna', lang: 'ko-KR' },
    { name: 'Google 한국의', lang: 'ko-KR' },
    { name: 'Google US English', lang: 'en-US' },
    { name: 'Kyoko', lang: 'ja-JP' },
  ];

  assert.deepEqual(getKoreanVoices(voices).map((voice) => voice.name), [
    'Yuna',
    'Google 한국의',
    'Flo (Korean (South Korea))',
    'Shelley (Korean (South Korea))',
    'Sandy (Korean (South Korea))',
    'Grandma (Korean (South Korea))',
    'Grandpa (Korean (South Korea))',
    'Eddy (Korean (South Korea))',
    'Reed (Korean (South Korea))',
    'Rocko (Korean (South Korea))',
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
