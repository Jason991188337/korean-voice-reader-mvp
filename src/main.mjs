import { cleanKoreanText, getKoreanVoices, buildSpeechUtteranceConfig, buildGoogleTtsMp3Links } from './app-logic.mjs';

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
const speakButton = $('speakButton');
const pauseButton = $('pauseButton');
const stopButton = $('stopButton');
const mp3Button = $('mp3Button');
const downloadLinks = $('downloadLinks');

let allVoices = [];
let isPaused = false;

function setStatus(message) {
  ocrStatus.textContent = message;
}

function refreshVoices() {
  allVoices = window.speechSynthesis?.getVoices?.() || [];
  const koreanVoices = getKoreanVoices(allVoices);
  voiceSelect.innerHTML = '';

  if (!('speechSynthesis' in window)) {
    voiceSelect.append(new Option('This browser does not support speech playback', ''));
    speakButton.disabled = true;
    return;
  }

  if (koreanVoices.length === 0) {
    voiceSelect.append(new Option('No recommended Korean voice is available on this browser', ''));
    speakButton.disabled = true;
    return;
  }

  speakButton.disabled = false;

  for (const voice of koreanVoices) {
    voiceSelect.append(new Option(voice.label, String(voice.index)));
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

function speak() {
  if (!('speechSynthesis' in window)) {
    setStatus('This browser does not support speech playback.');
    return;
  }

  const config = buildSpeechUtteranceConfig({
    text: textInput.value,
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

  utterance.onstart = () => setStatus('Playing speech...');
  utterance.onend = () => {
    isPaused = false;
    setStatus('Playback complete.');
  };
  utterance.onerror = (event) => setStatus(`Speech playback error: ${event.error || 'unknown error'}`);

  isPaused = false;
  window.speechSynthesis.speak(utterance);
}

function pauseOrResume() {
  if (!('speechSynthesis' in window)) return;
  if (window.speechSynthesis.speaking && !isPaused) {
    window.speechSynthesis.pause();
    isPaused = true;
    setStatus('Paused.');
  } else if (isPaused) {
    window.speechSynthesis.resume();
    isPaused = false;
    setStatus('Resumed playback.');
  }
}

function stop() {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  isPaused = false;
  setStatus('Stopped.');
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
mp3Button.addEventListener('click', renderMp3Links);
rateInput.addEventListener('input', () => { rateValue.value = Number(rateInput.value).toFixed(1); });
pitchInput.addEventListener('input', () => { pitchValue.value = Number(pitchInput.value).toFixed(1); });

refreshVoices();
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}
