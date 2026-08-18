import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanKoreanText,
  splitTextIntoLines,
  estimateTotalPlaybackDurationMs,
  formatTimeMmSs,
  getTextFromProgress,
  getRemainingLinesFromProgress,
  planTimeSeek,
} from '../src/app-logic.mjs';

const ELEMENT_IDS = [
  'imageInput', 'ocrButton', 'ocrStatus', 'textInput', 'cleanButton', 'sampleButton',
  'voiceSelect', 'rateInput', 'pitchInput', 'rateValue', 'pitchValue',
  'linePauseInput', 'linePauseValue', 'speakButton', 'pauseButton', 'stopButton',
  'mp3Button', 'singleMp3Button', 'downloadLinks', 'progressBar', 'progressPercent',
  'progressLabel', 'estimatedTime', 'timeSeekInput', 'timeSeekButton',
];

let harnessCount = 0;

function makeElement(tag = 'div') {
  const listeners = {};
  return {
    tagName: tag,
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    files: [],
    dataset: {},
    className: '',
    selectedOptions: [],
    children: [],
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    append(...nodes) { this.children.push(...nodes); },
    remove() {},
    click() { this.dispatch('click'); },
    dispatch(type, event = {}) { for (const fn of listeners[type] || []) fn(event); },
  };
}

async function createHarness() {
  const clock = { now: 1_700_000_000_000 };
  const timers = new Map();
  let timerId = 1;

  const fakeWindow = {
    setTimeout(fn, ms) { const id = timerId++; timers.set(id, { due: clock.now + ms, fn, interval: null }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn, ms) { const id = timerId++; timers.set(id, { due: clock.now + ms, fn, interval: ms }); return id; },
    clearInterval(id) { timers.delete(id); },
  };

  const synth = {
    queue: [],
    utterance: null,
    speaking: false,
    paused: false,
    spoken: [],
    cancelledUtterances: [],
    cancelCount: 0,
    speak(utt) { this.spoken.push(utt); this.queue.push(utt); },
    cancel() {
      this.cancelCount += 1;
      if (this.utterance) this.cancelledUtterances.push(this.utterance);
      this.cancelledUtterances.push(...this.queue);
      this.utterance = null;
      this.queue = [];
      this.speaking = false;
      this.paused = false;
    },
    pause() { this.paused = true; },
    resume() { this.paused = false; },
    getVoices() { return []; },
  };
  fakeWindow.speechSynthesis = synth;

  const els = {};
  for (const id of ELEMENT_IDS) els[id] = makeElement(id);
  els.rateInput.value = '1';
  els.pitchInput.value = '1';
  els.linePauseInput.value = '0.7';
  els.progressBar.value = '0';

  global.window = fakeWindow;
  global.document = {
    getElementById: (id) => els[id] || null,
    createElement: (tag) => makeElement(tag),
    body: makeElement('body'),
  };
  global.Option = class {
    constructor(text, value) {
      this.textContent = text;
      this.value = value;
      this.dataset = {};
    }
  };
  global.SpeechSynthesisUtterance = class {
    constructor(text) { this.text = text; }
  };
  Date.now = () => clock.now;

  await import(`../src/main.mjs?dom-harness=${++harnessCount}`);

  return {
    els,
    synth,
    clock,
    // Moves the next queued utterance into "speaking" state and fires onstart,
    // like a real speech engine picking up a speak() request asynchronously.
    startNextUtterance() {
      synth.utterance = synth.queue.shift() || null;
      assert.ok(synth.utterance, 'expected a queued utterance to start');
      synth.speaking = true;
      synth.utterance.onstart?.();
    },
    finishCurrentUtterance() {
      const utt = synth.utterance;
      assert.ok(utt, 'expected a current utterance to finish');
      synth.utterance = null;
      synth.speaking = false;
      utt.onend?.();
    },
    // Chrome fires an async `error` event with error='interrupted' on utterances
    // killed by speechSynthesis.cancel().
    flushCancelErrors(error = 'interrupted') {
      for (const utt of synth.cancelledUtterances.splice(0)) utt.onerror?.({ error });
    },
    // Safari-style engines fire `end` instead of `error` on cancelled utterances.
    flushCancelEnds() {
      for (const utt of synth.cancelledUtterances.splice(0)) utt.onend?.();
    },
    advance(ms) {
      const target = clock.now + ms;
      for (;;) {
        let nextId = null;
        let nextDue = Infinity;
        for (const [id, timer] of timers) {
          if (timer.due <= target && timer.due < nextDue) { nextDue = timer.due; nextId = id; }
        }
        if (nextId === null) break;
        const timer = timers.get(nextId);
        clock.now = timer.due;
        if (timer.interval != null) timer.due += timer.interval;
        else timers.delete(nextId);
        timer.fn();
      }
      clock.now = target;
    },
  };
}

const SINGLE_LINE_TEXT = '안녕하세요 오늘은 눈이 내리는 아침입니다 함께 겨울 이야기를 천천히 읽어 봅시다 '.repeat(4);
const MULTI_LINE_TEXT = [
  '첫째 줄은 펭귄 팩스가 눈밭을 걸어가는 이야기입니다',
  '둘째 줄은 폴리가 목도리를 두르고 노래하는 이야기입니다',
  '셋째 줄은 두 펭귄이 함께 겨울 바다를 바라보는 이야기입니다',
].join('\n');

test('typed seek while stopped sets slider and exact time display, then speaks from that position', async () => {
  const h = await createHarness();
  h.els.textInput.value = SINGLE_LINE_TEXT;

  const totalMs = estimateTotalPlaybackDurationMs(SINGLE_LINE_TEXT, { rate: 1, linePauseMs: 700 });
  assert.ok(totalMs > 10000, 'test text must run longer than the 10s seek target');
  const plan = planTimeSeek('0:10', totalMs);

  h.els.timeSeekInput.value = '0:10';
  h.els.timeSeekButton.click();

  assert.equal(Number(h.els.progressBar.value), plan.progress);
  assert.equal(h.els.timeSeekInput.value, '00:10');
  assert.equal(h.els.estimatedTime.textContent, `Estimated time 00:10 / ${formatTimeMmSs(totalMs)}`);
  assert.match(h.els.ocrStatus.textContent, /Seeking to estimated time 00:10/);

  const fullText = splitTextIntoLines(SINGLE_LINE_TEXT).join('\n');
  assert.equal(h.synth.spoken.length, 1);
  assert.equal(h.synth.spoken[0].text, cleanKoreanText(getTextFromProgress(fullText, plan.progress)));

  h.startNextUtterance();
  h.advance(500);
  assert.ok(Number(h.els.progressBar.value) >= plan.progress, 'playback must continue from the seek position');
});

test('Enter key in the time input seeks like the button', async () => {
  const h = await createHarness();
  h.els.textInput.value = SINGLE_LINE_TEXT;

  h.els.timeSeekInput.value = '0:10';
  h.els.timeSeekInput.dispatch('keydown', { key: 'Enter' });

  assert.ok(Number(h.els.progressBar.value) > 0);
  assert.equal(h.synth.spoken.length, 1);
});

test('typed seek during playback holds the target position until new playback starts', async () => {
  const h = await createHarness();
  h.els.textInput.value = SINGLE_LINE_TEXT;

  h.els.speakButton.click();
  h.startNextUtterance();
  h.advance(2000);

  const totalMs = estimateTotalPlaybackDurationMs(SINGLE_LINE_TEXT, { rate: 1, linePauseMs: 700 });
  const plan = planTimeSeek('0:10', totalMs);
  h.els.timeSeekInput.value = '0:10';
  h.els.timeSeekButton.click();

  assert.equal(Number(h.els.progressBar.value), plan.progress);
  assert.equal(h.els.estimatedTime.textContent, `Estimated time 00:10 / ${formatTimeMmSs(totalMs)}`);

  // The old 250ms progress interval must not keep running and drag the display
  // back to the pre-seek position while the new utterance is still starting.
  h.advance(600);
  assert.equal(Number(h.els.progressBar.value), plan.progress);
  assert.equal(h.els.estimatedTime.textContent, `Estimated time 00:10 / ${formatTimeMmSs(totalMs)}`);

  // Chrome then reports the cancelled utterance as an async 'interrupted' error;
  // that must not reset the display to 00:00 or show a playback error.
  h.flushCancelErrors('interrupted');
  assert.equal(Number(h.els.progressBar.value), plan.progress);
  assert.doesNotMatch(h.els.ocrStatus.textContent, /error/i);
  assert.doesNotMatch(h.els.estimatedTime.textContent, /^Estimated time 00:00/);

  h.startNextUtterance();
  h.advance(300);
  assert.ok(Number(h.els.progressBar.value) >= plan.progress);
  assert.match(h.els.estimatedTime.textContent, /^Estimated time 00:10 /, 'display should continue from the typed target time, not round down after playback starts');
});

test('repeated typed seeks stay stable (seek after a prior seek)', async () => {
  const h = await createHarness();
  h.els.textInput.value = SINGLE_LINE_TEXT;

  h.els.timeSeekInput.value = '0:10';
  h.els.timeSeekButton.click();
  h.startNextUtterance();
  h.advance(1000);
  h.flushCancelErrors('interrupted');

  const totalMs = estimateTotalPlaybackDurationMs(SINGLE_LINE_TEXT, { rate: 1, linePauseMs: 700 });
  const plan = planTimeSeek('0:05', totalMs);
  h.els.timeSeekInput.value = '0:05';
  h.els.timeSeekButton.click();

  h.flushCancelErrors('interrupted');
  h.advance(600);
  assert.equal(Number(h.els.progressBar.value), plan.progress);
  assert.doesNotMatch(h.els.ocrStatus.textContent, /error/i);

  h.startNextUtterance();
  h.advance(300);
  assert.ok(Number(h.els.progressBar.value) >= plan.progress);
});

test('a cancelled utterance firing end (Safari-style) does not fake playback completion', async () => {
  const h = await createHarness();
  h.els.textInput.value = SINGLE_LINE_TEXT;

  h.els.speakButton.click();
  h.startNextUtterance();
  h.advance(1500);

  const totalMs = estimateTotalPlaybackDurationMs(SINGLE_LINE_TEXT, { rate: 1, linePauseMs: 700 });
  const plan = planTimeSeek('0:10', totalMs);
  h.els.timeSeekInput.value = '0:10';
  h.els.timeSeekButton.click();

  h.flushCancelEnds();
  assert.equal(Number(h.els.progressBar.value), plan.progress);
  assert.notEqual(h.els.progressLabel.textContent, 'Playback complete');
  assert.doesNotMatch(h.els.ocrStatus.textContent, /Playback complete/);
});

test('typed time beyond the estimated total clamps to the end with a helpful status', async () => {
  const h = await createHarness();
  h.els.textInput.value = SINGLE_LINE_TEXT;

  const totalMs = estimateTotalPlaybackDurationMs(SINGLE_LINE_TEXT, { rate: 1, linePauseMs: 700 });
  h.els.timeSeekInput.value = '99:59';
  h.els.timeSeekButton.click();

  assert.equal(Number(h.els.progressBar.value), 100);
  assert.equal(h.els.timeSeekInput.value, formatTimeMmSs(totalMs));
  assert.match(h.els.ocrStatus.textContent, /past the estimated total/);
  assert.equal(h.els.estimatedTime.textContent, `Estimated time ${formatTimeMmSs(totalMs)} / ${formatTimeMmSs(totalMs)}`);
});

test('invalid typed time leaves current playback untouched and explains the format', async () => {
  const h = await createHarness();
  h.els.textInput.value = SINGLE_LINE_TEXT;

  h.els.speakButton.click();
  h.startNextUtterance();
  h.advance(2000);
  const progressBefore = Number(h.els.progressBar.value);
  const cancelsBefore = h.synth.cancelCount;

  h.els.timeSeekInput.value = 'abc';
  h.els.timeSeekButton.click();

  assert.match(h.els.ocrStatus.textContent, /mm:ss/);
  assert.equal(h.synth.cancelCount, cancelsBefore, 'invalid input must not cancel playback');
  assert.equal(Number(h.els.progressBar.value), progressBefore);

  h.advance(1000);
  assert.ok(Number(h.els.progressBar.value) > progressBefore, 'playback timer must keep running');
});

test('typed seek during line-by-line playback restarts from the matching line', async () => {
  const h = await createHarness();
  h.els.textInput.value = MULTI_LINE_TEXT;

  h.els.speakButton.click();
  h.startNextUtterance();
  h.advance(1000);

  const totalMs = estimateTotalPlaybackDurationMs(MULTI_LINE_TEXT, { rate: 1, linePauseMs: 700 });
  assert.ok(totalMs > 10000, 'test text must run longer than the 10s seek target');
  const plan = planTimeSeek('0:10', totalMs);
  h.els.timeSeekInput.value = '0:10';
  h.els.timeSeekButton.click();

  assert.equal(Number(h.els.progressBar.value), plan.progress);
  assert.equal(h.els.estimatedTime.textContent, `Estimated time ${plan.label} / ${formatTimeMmSs(totalMs)}`);

  const joined = splitTextIntoLines(MULTI_LINE_TEXT).join('\n');
  const remaining = getRemainingLinesFromProgress(joined, plan.progress);
  const newUtterance = h.synth.spoken.at(-1);
  assert.equal(newUtterance.text, remaining[0]);

  // Stale events from the cancelled line must not disturb the new sequence.
  h.flushCancelErrors('interrupted');
  h.flushCancelEnds();
  h.advance(600);
  assert.equal(Number(h.els.progressBar.value), plan.progress);
  assert.doesNotMatch(h.els.ocrStatus.textContent, /error/i);

  h.startNextUtterance();
  h.advance(300);
  assert.ok(Number(h.els.progressBar.value) >= plan.progress);

  // The rest of the sequence still walks line by line with the pause in between.
  const spokenBefore = h.synth.spoken.length;
  h.finishCurrentUtterance();
  h.advance(700);
  assert.equal(h.synth.spoken.length, spokenBefore + 1, 'next line must be queued after the line pause');
});

test('typed seek while paused resumes playback from the requested time', async () => {
  const h = await createHarness();
  h.els.textInput.value = SINGLE_LINE_TEXT;

  h.els.speakButton.click();
  h.startNextUtterance();
  h.advance(2000);
  h.els.pauseButton.click();
  assert.equal(h.synth.paused, true);

  const totalMs = estimateTotalPlaybackDurationMs(SINGLE_LINE_TEXT, { rate: 1, linePauseMs: 700 });
  const plan = planTimeSeek('0:10', totalMs);
  h.els.timeSeekInput.value = '0:10';
  h.els.timeSeekButton.click();

  assert.equal(h.synth.paused, false);
  assert.equal(Number(h.els.progressBar.value), plan.progress);

  h.flushCancelErrors('interrupted');
  h.startNextUtterance();
  h.advance(500);
  assert.ok(Number(h.els.progressBar.value) >= plan.progress);
});
