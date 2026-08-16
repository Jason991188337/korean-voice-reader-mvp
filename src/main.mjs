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
    voiceSelect.append(new Option('이 브라우저는 음성 읽기를 지원하지 않습니다', ''));
    speakButton.disabled = true;
    return;
  }

  if (koreanVoices.length === 0) {
    voiceSelect.append(new Option('Yuna 또는 Google 한국어 음성이 없습니다', ''));
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
    setStatus('먼저 이미지를 선택해주세요.');
    return;
  }
  if (!window.Tesseract) {
    setStatus('OCR 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.');
    return;
  }

  ocrButton.disabled = true;
  setStatus('OCR 준비 중... 첫 실행은 언어 데이터를 받느라 조금 걸릴 수 있습니다.');

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
    setStatus(cleaned ? 'OCR 완료. 결과를 확인한 뒤 읽기를 눌러주세요.' : '문자를 찾지 못했습니다. 더 선명한 사진을 사용해보세요.');
  } catch (error) {
    console.error(error);
    setStatus(`OCR 실패: ${error.message || error}`);
  } finally {
    ocrButton.disabled = false;
  }
}

function speak() {
  if (!('speechSynthesis' in window)) {
    setStatus('이 브라우저는 음성 읽기를 지원하지 않습니다.');
    return;
  }

  const config = buildSpeechUtteranceConfig({
    text: textInput.value,
    rate: rateInput.value,
    pitch: pitchInput.value,
    voiceIndex: voiceSelect.value,
  });

  if (!config.text) {
    setStatus('읽을 문장을 먼저 입력해주세요.');
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

  utterance.onstart = () => setStatus('음성 재생 중...');
  utterance.onend = () => {
    isPaused = false;
    setStatus('재생 완료.');
  };
  utterance.onerror = (event) => setStatus(`음성 재생 오류: ${event.error || '알 수 없는 오류'}`);

  isPaused = false;
  window.speechSynthesis.speak(utterance);
}

function pauseOrResume() {
  if (!('speechSynthesis' in window)) return;
  if (window.speechSynthesis.speaking && !isPaused) {
    window.speechSynthesis.pause();
    isPaused = true;
    setStatus('일시정지됨.');
  } else if (isPaused) {
    window.speechSynthesis.resume();
    isPaused = false;
    setStatus('다시 재생 중...');
  }
}

function stop() {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  isPaused = false;
  setStatus('중지됨.');
}

function renderMp3Links() {
  const links = buildGoogleTtsMp3Links(textInput.value);
  downloadLinks.innerHTML = '';

  if (links.length === 0) {
    setStatus('MP3로 만들 문장을 먼저 입력해주세요.');
    return;
  }

  const note = document.createElement('p');
  note.className = 'note';
  note.textContent = links.length === 1
    ? '아래 링크를 열어 MP3를 저장하세요. 브라우저에 따라 새 탭에서 열린 뒤 저장해야 할 수 있습니다.'
    : '문장이 길어서 여러 개의 MP3 링크로 나눴습니다. 각 part를 저장하세요.';
  downloadLinks.append(note);

  for (const link of links) {
    const anchor = document.createElement('a');
    anchor.href = link.url;
    anchor.download = link.filename;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = `${link.filename} 다운로드/열기`;
    downloadLinks.append(anchor);
  }

  setStatus(`MP3 링크 ${links.length}개를 만들었습니다.`);
}

ocrButton.addEventListener('click', runOcr);
cleanButton.addEventListener('click', () => {
  textInput.value = cleanKoreanText(textInput.value);
  setStatus('문장을 정리했습니다.');
});
sampleButton.addEventListener('click', () => {
  textInput.value = '안녕하세요. 이 페이지는 한글 문장을 한국어 음성으로 읽어주는 무료 MVP입니다.';
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
