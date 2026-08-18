import {
  cleanKoreanText,
  getPlayableVoiceOptions,
  buildSpeechUtteranceConfig,
  buildGoogleTtsMp3Links,
  estimateSpeechDurationMs,
  calculatePlaybackProgress,
  getTextFromProgress,
  getSingleMp3Mode,
  buildSingleMp3Request,
  splitTextIntoLines,
  clampLinePauseMs,
  getRemainingLinesFromProgress,
  formatTimeMmSs,
  parseTimeMmSs,
  estimateTotalPlaybackDurationMs,
  getProgressFromTimeMs,
} from './app-logic.mjs?v=20260818-time-seek';
import { SINGLE_MP3_WORKER_URL } from './config.mjs?v=20260817-single-mp3';

const $ = (id) => document.getElementById(id);

const imageInput = $('imageInput');
const ocrButton = $('ocrButton');
const ocrStatus = $('ocrStatus');
const textInput = $('textInput');
const cleanButton = $('cleanButton');
const sampleButton = $('sampleButton');
const voiceSelect = $('voiceSelect');
const rateInput = $('rateInput');
const pitchInput = $('pitchInput');
const rateValue = $('rateValue');
const pitchValue = $('pitchValue');
const linePauseInput = $('linePauseInput');
const linePauseValue = $('linePauseValue');
const speakButton = $('speakButton');
const pauseButton = $('pauseButton');
const stopButton = $('stopButton');
const mp3Button = $('mp3Button');
const singleMp3Button = $('singleMp3Button');
const downloadLinks = $('downloadLinks');
const progressBar = $('progressBar');
const progressPercent = $('progressPercent');
const progressLabel = $('progressLabel');
const estimatedTime = $('estimatedTime');
const timeSeekInput = $('timeSeekInput');
const timeSeekButton = $('timeSeekButton');

let allVoices = [];
let playableVoiceOptions = [];
let isPaused = false;
let playbackTimer = null;
let playbackStartedAt = 0;
let playbackDurationMs = 0;
let pausedAt = 0;
let playbackFullText = '';
let lineQueue = [];
let linePauseTimer = null;
let resumeNextLine = false;
let speakNextLineRef = null;

function clearLinePauseTimer() {
  if (linePauseTimer) {
    window.clearTimeout(linePauseTimer);
    linePauseTimer = null;
  }
}

function currentLinePauseMs() {
  return clampLinePauseMs(Number(linePauseInput.value) * 1000);
}

function setStatus(message) {
  ocrStatus.textContent = message;
}

function totalEstimatedDurationMs() {
  if (playbackTimer || pausedAt) return playbackDurationMs;
  return estimateTotalPlaybackDurationMs(playbackFullText || textInput.value, {
    rate: rateInput.value,
    linePauseMs: currentLinePauseMs(),
  });
}

function updateEstimatedTime(percent) {
  const totalMs = totalEstimatedDurationMs();
  const currentMs = totalMs * (Math.min(100, Math.max(0, percent)) / 100);
  estimatedTime.textContent = `Estimated time ${formatTimeMmSs(currentMs)} / ${formatTimeMmSs(totalMs)}`;
}

function setProgress(percent, label = 'Playback progress') {
  const safePercent = Math.min(100, Math.max(0, Math.round(percent)));
  progressBar.value = safePercent;
  progressPercent.textContent = `${safePercent}%`;
  progressLabel.textContent = label;
  updateEstimatedTime(safePercent);
}

function stopProgressTimer(finalPercent = 0, label = 'Playback progress') {
  if (playbackTimer) {
    window.clearInterval(playbackTimer);
    playbackTimer = null;
  }
  setProgress(finalPercent, label);
}

function startProgressTimer(text, rate, initialProgress = 0, extraDurationMs = 0) {
  stopProgressTimer(initialProgress, 'Starting playback...');
  playbackDurationMs = estimateSpeechDurationMs(text, rate) + extraDurationMs;
  const initialElapsed = playbackDurationMs * (Math.min(100, Math.max(0, initialProgress)) / 100);
  playbackStartedAt = Date.now() - initialElapsed;
  pausedAt = 0;
  playbackTimer = window.setInterval(() => {
    const progress = calculatePlaybackProgress({
      startedAt: playbackStartedAt,
      now: Date.now(),
      durationMs: playbackDurationMs,
    });
    setProgress(progress, 'Playing...');
    if (progress >= 100) {
      stopProgressTimer(100, 'Finishing...');
    }
  }, 250);
}

function pauseProgressTimer() {
  if (!playbackTimer) return;
  pausedAt = Date.now();
  window.clearInterval(playbackTimer);
  playbackTimer = null;
  setProgress(progressBar.value, 'Paused');
}

function resumeProgressTimer() {
  if (!pausedAt || !playbackDurationMs) return;
  playbackStartedAt += Date.now() - pausedAt;
  pausedAt = 0;
  playbackTimer = window.setInterval(() => {
    const progress = calculatePlaybackProgress({
      startedAt: playbackStartedAt,
      now: Date.now(),
      durationMs: playbackDurationMs,
    });
    setProgress(progress, 'Playing...');
    if (progress >= 100) {
      stopProgressTimer(100, 'Finishing...');
    }
  }, 250);
}

function refreshVoices() {
  allVoices = window.speechSynthesis?.getVoices?.() || [];
  playableVoiceOptions = getPlayableVoiceOptions(allVoices);
  voiceSelect.innerHTML = '';

  if (!('speechSynthesis' in window)) {
    voiceSelect.append(new Option('This browser does not support speech playback', ''));
    speakButton.disabled = true;
    return;
  }

  speakButton.disabled = false;

  for (const voice of playableVoiceOptions) {
    const option = new Option(voice.label, voice.index === null ? voice.type : String(voice.index));
    option.dataset.type = voice.type;
    voiceSelect.append(option);
  }
}

async function runOcr() {
  const file = imageInput.files?.[0];
  if (!file) {
    setStatus('Please choose an image first.');
    return;
  }
  if (!window.Tesseract) {
    setStatus('The OCR library could not be loaded. Please check your internet connection.');
    return;
  }

  ocrButton.disabled = true;
  setStatus('Preparing OCR... The first run may take a little while while language data downloads.');

  try {
    const result = await window.Tesseract.recognize(file, 'kor+eng', {
      logger: (event) => {
        if (event.status) {
          const pct = event.progress ? ` ${Math.round(event.progress * 100)}%` : '';
          setStatus(`${event.status}${pct}`);
        }
      },
    });
    const cleaned = cleanKoreanText(result.data.text);
    textInput.value = cleaned;
    setStatus(cleaned ? 'OCR complete. Review the result, then press Speak.' : 'No text was found. Try a clearer image.');
  } catch (error) {
    console.error(error);
    setStatus(`OCR failed: ${error.message || error}`);
  } finally {
    ocrButton.disabled = false;
  }
}

function playSpeech(textToSpeak, initialProgress = 0) {
  if (!('speechSynthesis' in window)) {
    setStatus('This browser does not support speech playback.');
    return;
  }

  const config = buildSpeechUtteranceConfig({
    text: textToSpeak,
    rate: rateInput.value,
    pitch: pitchInput.value,
    voiceIndex: voiceSelect.value,
  });

  if (!config.text) {
    setStatus('Please enter text to read first.');
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(config.text);
  utterance.lang = config.lang;
  utterance.rate = config.rate;
  utterance.pitch = config.pitch;

  if (config.voiceIndex !== null && allVoices[config.voiceIndex]) {
    utterance.voice = allVoices[config.voiceIndex];
  }

  utterance.onstart = () => {
    startProgressTimer(playbackFullText || config.text, config.rate, initialProgress);
    const selected = voiceSelect.selectedOptions[0]?.textContent || 'selected Korean voice';
    setStatus(`Playing with ${selected}...`);
  };
  utterance.onend = () => {
    isPaused = false;
    stopProgressTimer(100, 'Playback complete');
    setStatus('Playback complete.');
  };
  utterance.onerror = (event) => {
    stopProgressTimer(0, 'Playback error');
    setStatus(`Speech playback error: ${event.error || 'unknown error'}`);
  };

  isPaused = false;
  window.speechSynthesis.speak(utterance);
}

function playLineSequence(lines, initialProgress = 0) {
  clearLinePauseTimer();
  window.speechSynthesis.cancel();
  resumeNextLine = false;
  isPaused = false;
  lineQueue = lines.slice();
  const pauseMs = currentLinePauseMs();
  const totalPauseMs = pauseMs * Math.max(0, lines.length - 1);
  let started = false;

  const speakNextLine = () => {
    linePauseTimer = null;
    const line = lineQueue.shift();
    if (!line) return;

    const config = buildSpeechUtteranceConfig({
      text: line,
      rate: rateInput.value,
      pitch: pitchInput.value,
      voiceIndex: voiceSelect.value,
    });

    const utterance = new SpeechSynthesisUtterance(config.text);
    utterance.lang = config.lang;
    utterance.rate = config.rate;
    utterance.pitch = config.pitch;
    if (config.voiceIndex !== null && allVoices[config.voiceIndex]) {
      utterance.voice = allVoices[config.voiceIndex];
    }

    utterance.onstart = () => {
      if (!started) {
        started = true;
        startProgressTimer(playbackFullText, config.rate, initialProgress, totalPauseMs);
        const selected = voiceSelect.selectedOptions[0]?.textContent || 'selected Korean voice';
        setStatus(`Playing line by line with ${selected}...`);
      }
    };
    utterance.onend = () => {
      if (lineQueue.length === 0) {
        isPaused = false;
        stopProgressTimer(100, 'Playback complete');
        setStatus('Playback complete.');
        return;
      }
      if (isPaused) {
        resumeNextLine = true;
        return;
      }
      linePauseTimer = window.setTimeout(speakNextLine, pauseMs);
    };
    utterance.onerror = (event) => {
      if (event.error === 'interrupted' || event.error === 'canceled') return;
      clearLinePauseTimer();
      lineQueue = [];
      stopProgressTimer(0, 'Playback error');
      setStatus(`Speech playback error: ${event.error || 'unknown error'}`);
    };

    window.speechSynthesis.speak(utterance);
  };

  speakNextLineRef = speakNextLine;
  speakNextLine();
}

function speak() {
  const lines = splitTextIntoLines(textInput.value);

  if (lines.length > 1) {
    if (!('speechSynthesis' in window)) {
      setStatus('This browser does not support speech playback.');
      return;
    }
    playbackFullText = lines.join('\n');
    playLineSequence(lines, 0);
    return;
  }

  playbackFullText = cleanKoreanText(textInput.value);
  playSpeech(playbackFullText, 0);
}

function pauseOrResume() {
  if (!('speechSynthesis' in window)) return;
  if (window.speechSynthesis.speaking && !isPaused) {
    window.speechSynthesis.pause();
    isPaused = true;
    pauseProgressTimer();
    setStatus('Paused.');
  } else if (linePauseTimer && !isPaused) {
    clearLinePauseTimer();
    resumeNextLine = true;
    isPaused = true;
    pauseProgressTimer();
    setStatus('Paused.');
  } else if (isPaused) {
    isPaused = false;
    if (resumeNextLine) {
      resumeNextLine = false;
      resumeProgressTimer();
      speakNextLineRef?.();
    } else {
      window.speechSynthesis.resume();
      resumeProgressTimer();
    }
    setStatus('Resumed playback.');
  }
}

function stop() {
  if (!('speechSynthesis' in window)) return;
  clearLinePauseTimer();
  lineQueue = [];
  resumeNextLine = false;
  window.speechSynthesis.cancel();
  isPaused = false;
  pausedAt = 0;
  stopProgressTimer(0, 'Playback stopped');
  setStatus('Stopped.');
}

function seekPlayback() {
  const targetProgress = Number(progressBar.value);
  setProgress(targetProgress, 'Seek position');

  const lines = splitTextIntoLines(playbackFullText || textInput.value);
  if (lines.length === 0) {
    setStatus('Please enter text before seeking playback.');
    return;
  }

  if (!('speechSynthesis' in window)) return;
  playbackFullText = lines.join('\n');
  clearLinePauseTimer();
  window.speechSynthesis.cancel();
  isPaused = false;
  pausedAt = 0;

  if (lines.length > 1) {
    const remainingLines = getRemainingLinesFromProgress(playbackFullText, targetProgress);
    playLineSequence(remainingLines, targetProgress);
    return;
  }

  const remainingText = getTextFromProgress(playbackFullText, targetProgress);
  playSpeech(remainingText, targetProgress);
}

function seekToTime() {
  const requestedMs = parseTimeMmSs(timeSeekInput.value);
  if (requestedMs === null) {
    setStatus('Enter a time as mm:ss, for example 01:30.');
    return;
  }

  const totalMs = estimateTotalPlaybackDurationMs(playbackFullText || textInput.value, {
    rate: rateInput.value,
    linePauseMs: currentLinePauseMs(),
  });
  if (!totalMs) {
    setStatus('Please enter text before seeking playback.');
    return;
  }

  progressBar.value = getProgressFromTimeMs(requestedMs, totalMs);
  seekPlayback();
}

function renderMp3Links() {
  const links = buildGoogleTtsMp3Links(textInput.value);
  downloadLinks.innerHTML = '';

  if (links.length === 0) {
    setStatus('Please enter text before creating an MP3 link.');
    return;
  }

  const note = document.createElement('p');
  note.className = 'note';
  note.textContent = links.length === 1
    ? 'Open the link below to save the MP3. Depending on your browser, it may open in a new tab first.'
    : 'The text is long, so it was split into multiple MP3 links. Save each part.';
  downloadLinks.append(note);

  for (const link of links) {
    const anchor = document.createElement('a');
    anchor.href = link.url;
    anchor.download = link.filename;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = `Download/open ${link.filename}`;
    downloadLinks.append(anchor);
  }

  setStatus(`Created ${links.length} MP3 link${links.length === 1 ? '' : 's'}.`);
}

async function downloadSingleMp3() {
  if (getSingleMp3Mode(SINGLE_MP3_WORKER_URL) !== 'worker') {
    setStatus('Single MP3 needs a free Cloudflare Worker: deploy cloudflare-worker/ (see README), then set SINGLE_MP3_WORKER_URL in src/config.mjs. Showing multi-part links instead.');
    renderMp3Links();
    return;
  }

  const request = buildSingleMp3Request(textInput.value, { workerUrl: SINGLE_MP3_WORKER_URL });
  if (!request) {
    setStatus('Please enter text before creating an MP3.');
    return;
  }

  singleMp3Button.disabled = true;
  setStatus('Creating a single MP3 on the worker...');

  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });
    if (!response.ok) {
      throw new Error(`worker responded with ${response.status}`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = request.filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    setStatus('Single MP3 download started.');
  } catch (error) {
    setStatus(`Single MP3 failed (${error.message || error}). You can still use Create Google MP3 Download Link.`);
  } finally {
    singleMp3Button.disabled = false;
  }
}

ocrButton.addEventListener('click', runOcr);
cleanButton.addEventListener('click', () => {
  textInput.value = cleanKoreanText(textInput.value);
  setStatus('Text cleaned.');
});
sampleButton.addEventListener('click', () => {
  textInput.value = '안녕하세요. This free MVP reads Korean text aloud and can create an MP3 link.';
});
speakButton.addEventListener('click', speak);
pauseButton.addEventListener('click', pauseOrResume);
stopButton.addEventListener('click', stop);
progressBar.addEventListener('input', () => setProgress(progressBar.value, 'Seek position'));
progressBar.addEventListener('change', seekPlayback);
timeSeekButton.addEventListener('click', seekToTime);
timeSeekInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') seekToTime();
});
mp3Button.addEventListener('click', renderMp3Links);
singleMp3Button.addEventListener('click', downloadSingleMp3);
rateInput.addEventListener('input', () => { rateValue.value = Number(rateInput.value).toFixed(1); });
pitchInput.addEventListener('input', () => { pitchValue.value = Number(pitchInput.value).toFixed(1); });
linePauseInput.addEventListener('input', () => { linePauseValue.value = Number(linePauseInput.value).toFixed(1); });
textInput.addEventListener('input', () => updateEstimatedTime(progressBar.value));
rateInput.addEventListener('input', () => updateEstimatedTime(progressBar.value));
linePauseInput.addEventListener('input', () => updateEstimatedTime(progressBar.value));

updateEstimatedTime(0);
refreshVoices();
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}
