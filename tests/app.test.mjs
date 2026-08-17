import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

import {
  cleanKoreanText,
  getKoreanVoices,
  buildSpeechUtteranceConfig,
  buildGoogleTtsMp3Links,
  estimateSpeechDurationMs,
  calculatePlaybackProgress,
  getPlayableVoiceOptions,
  getTextFromProgress,
  splitTextIntoChunks,
  getSingleMp3Mode,
  buildSingleMp3Request,
  splitTextIntoLines,
  clampLinePauseMs,
  getRemainingLinesFromProgress,
} from '../src/app-logic.mjs';
import { SINGLE_MP3_WORKER_URL } from '../src/config.mjs';

test('cleanKoreanText normalizes OCR whitespace while preserving Korean punctuation', () => {
  const raw = '  안녕\n\n하세요   세계 !  \n오늘은   좋은 날입니다.  ';
  assert.equal(cleanKoreanText(raw), '안녕하세요 세계! 오늘은 좋은 날입니다.');
});

test('getKoreanVoices keeps Yuna and Google first while adding recommended available Korean voices', () => {
  const voices = [
    { name: 'Alex', lang: 'en-US' },
    { name: 'Eddy (Korean (South Korea))', lang: 'ko-KR' },
    { name: 'Flo (Korean (South Korea))', lang: 'ko-KR' },
    { name: 'Yuna', lang: 'ko-KR' },
    { name: 'Google 한국의', lang: 'ko-KR' },
    { name: 'Google US English', lang: 'en-US' },
    { name: 'Kyoko', lang: 'ja-JP' },
  ];

  assert.deepEqual(getKoreanVoices(voices), [
    { index: 3, name: 'Yuna', lang: 'ko-KR', label: 'Yuna — ko-KR', type: 'browser' },
    { index: 4, name: 'Google 한국의', lang: 'ko-KR', label: 'Google 한국의 — ko-KR', type: 'browser' },
    { index: 2, name: 'Flo (Korean (South Korea))', lang: 'ko-KR', label: 'Flo (Korean (South Korea)) — ko-KR', type: 'browser' },
    { index: 1, name: 'Eddy (Korean (South Korea))', lang: 'ko-KR', label: 'Eddy (Korean (South Korea)) — ko-KR', type: 'browser' },
  ]);
});

test('getPlayableVoiceOptions falls back to Yuna and Google when mobile browser exposes no Korean voices', () => {
  assert.deepEqual(getPlayableVoiceOptions([]), [
    { index: null, name: 'Yuna', lang: 'ko-KR', label: 'Yuna — ko-KR', type: 'fallback-yuna' },
    { index: null, name: 'Google Korean', lang: 'ko-KR', label: 'Google Korean — ko-KR', type: 'fallback-google' },
  ]);
});

test('getPlayableVoiceOptions adds missing Google fallback when only Yuna is available', () => {
  assert.deepEqual(getPlayableVoiceOptions([{ name: 'Yuna', lang: 'ko-KR' }]), [
    { index: 0, name: 'Yuna', lang: 'ko-KR', label: 'Yuna — ko-KR', type: 'browser' },
    { index: null, name: 'Google Korean', lang: 'ko-KR', label: 'Google Korean — ko-KR', type: 'fallback-google' },
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

test('estimateSpeechDurationMs scales by text length and speech rate', () => {
  const normal = estimateSpeechDurationMs('안녕하세요'.repeat(20), 1);
  const fast = estimateSpeechDurationMs('안녕하세요'.repeat(20), 2);
  assert.ok(normal >= 3000);
  assert.ok(fast < normal);
});

test('calculatePlaybackProgress clamps elapsed playback progress', () => {
  assert.equal(calculatePlaybackProgress({ startedAt: 1000, now: 1000, durationMs: 5000 }), 0);
  assert.equal(calculatePlaybackProgress({ startedAt: 1000, now: 3500, durationMs: 5000 }), 50);
  assert.equal(calculatePlaybackProgress({ startedAt: 1000, now: 9000, durationMs: 5000 }), 100);
});

test('getTextFromProgress returns remaining text for an estimated seek position', () => {
  const text = '가나다라마바사아자차';
  assert.equal(getTextFromProgress(text, 0), text);
  assert.equal(getTextFromProgress(text, 50), '바사아자차');
  assert.equal(getTextFromProgress(text, 100), '차');
});

test('splitTextIntoChunks keeps chunks within maxChars and preserves all text', () => {
  const text = '안녕하세요. 좋은 아침입니다. 오늘은 눈이 내립니다. '.repeat(10);
  const chunks = splitTextIntoChunks(text, 60);

  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 60);
  }
  assert.equal(chunks.join(' '), cleanKoreanText(text));
});

test('splitTextIntoChunks returns empty array for blank input', () => {
  assert.deepEqual(splitTextIntoChunks('   ', 100), []);
});

test('getSingleMp3Mode uses worker only when a worker URL is configured', () => {
  assert.equal(getSingleMp3Mode(''), 'links');
  assert.equal(getSingleMp3Mode('   '), 'links');
  assert.equal(getSingleMp3Mode(undefined), 'links');
  assert.equal(getSingleMp3Mode('not-a-url'), 'links');
  assert.equal(getSingleMp3Mode('https://tts.example.workers.dev'), 'worker');
});

test('buildSingleMp3Request builds a JSON POST for the worker with cleaned text', () => {
  const request = buildSingleMp3Request('  안녕하세요   세계 ! ', {
    workerUrl: 'https://tts.example.workers.dev',
  });

  assert.deepEqual(request, {
    url: 'https://tts.example.workers.dev',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '안녕하세요 세계!', lang: 'ko' }),
    filename: 'korean-voice.mp3',
  });
});

test('buildSingleMp3Request returns null without text or worker URL', () => {
  assert.equal(buildSingleMp3Request('', { workerUrl: 'https://tts.example.workers.dev' }), null);
  assert.equal(buildSingleMp3Request('안녕하세요', { workerUrl: '' }), null);
});

test('splitTextIntoLines splits on newlines, cleans each line, and skips blank lines', () => {
  const raw = '  첫째 줄입니다.  \n\n둘째   줄입니다 !\n   \n셋째 줄입니다.';
  assert.deepEqual(splitTextIntoLines(raw), [
    '첫째 줄입니다.',
    '둘째 줄입니다!',
    '셋째 줄입니다.',
  ]);
});

test('splitTextIntoLines handles single-line and blank input', () => {
  assert.deepEqual(splitTextIntoLines('안녕하세요.'), ['안녕하세요.']);
  assert.deepEqual(splitTextIntoLines('   \n  \n'), []);
  assert.deepEqual(splitTextIntoLines(''), []);
});

test('clampLinePauseMs clamps to a sane range and defaults to 700ms', () => {
  assert.equal(clampLinePauseMs(700), 700);
  assert.equal(clampLinePauseMs('1500'), 1500);
  assert.equal(clampLinePauseMs(-100), 0);
  assert.equal(clampLinePauseMs(99999), 3000);
  assert.equal(clampLinePauseMs('abc'), 700);
  assert.equal(clampLinePauseMs(undefined), 700);
});

test('getRemainingLinesFromProgress returns remaining lines for a seek position', () => {
  const text = '가나다라\n마바사아\n자차카타';
  assert.deepEqual(getRemainingLinesFromProgress(text, 0), ['가나다라', '마바사아', '자차카타']);
  assert.deepEqual(getRemainingLinesFromProgress(text, 50), ['사아', '자차카타']);
  assert.deepEqual(getRemainingLinesFromProgress(text, 100), ['타']);
  assert.deepEqual(getRemainingLinesFromProgress('', 50), []);
});

test('config exposes an empty single MP3 worker URL by default', () => {
  assert.equal(typeof SINGLE_MP3_WORKER_URL, 'string');
});

test('static UI includes the Download Single MP3 button', () => {
  const html = readFileSync(join(projectRoot, 'index.html'), 'utf8');
  assert.match(html, /id="singleMp3Button"/);
  assert.match(html, /Download Single MP3/);
});

test('static UI includes the line pause control with a 0.7s default', () => {
  const html = readFileSync(join(projectRoot, 'index.html'), 'utf8');
  assert.match(html, /id="linePauseInput"/);
  assert.match(html, /id="linePauseValue"/);
  assert.match(html, /Line pause/);
  assert.match(html, /id="linePauseInput"[^>]*value="0.7"/);
});

test('static UI includes winter Pax and Polly visual theme hooks', () => {
  const html = readFileSync(join(projectRoot, 'index.html'), 'utf8');
  const css = readFileSync(join(projectRoot, 'src/styles.css'), 'utf8');

  assert.match(html, /Winter Voice Studio/);
  assert.match(html, /Pax/);
  assert.match(html, /Polly/);
  assert.match(html, /mascot-row/);
  assert.match(css, /winter-gradient/);
  assert.match(css, /penguin-card/);
  assert.match(css, /snowflake/);
});
