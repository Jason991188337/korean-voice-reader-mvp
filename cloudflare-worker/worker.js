// Free Cloudflare Worker that turns long Korean text into ONE MP3 response.
// It splits the text into Google Translate TTS-sized chunks, fetches each chunk
// server-side, and streams back the concatenated bytes as a single audio/mpeg file.
//
// Limitation: the chunks are independent MP3 files joined by naive byte
// concatenation. MP3 frames are self-contained so virtually all players handle
// this, but seek bars may show an inaccurate total duration and there can be a
// tiny gap at chunk boundaries. A frame-accurate merge would need an MP3 parser,
// which does not fit the free/zero-dependency goal.

const MAX_CHARS_PER_CHUNK = 180;
const MAX_TOTAL_CHARS = 6000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Mirrors cleanKoreanText + splitTextIntoChunks in src/app-logic.mjs.
// Duplicated so the worker stays a single self-contained deployable file.
function cleanKoreanText(input = '') {
  return String(input)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/([가-힣])\s*\n+\s*([가-힣])/g, '$1$2')
    .replace(/\n{2,}/g, '\n')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s+([,.!?;:。！？])/g, '$1')
    .trim();
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

function googleTtsUrl(chunk, lang) {
  const params = new URLSearchParams({
    ie: 'UTF-8',
    q: chunk,
    tl: lang,
    client: 'tw-ob',
  });
  return `https://translate.google.com/translate_tts?${params.toString()}`;
}

function errorResponse(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export default {
  // fetchTts is injectable for tests; Workers pass only (request, env, ctx).
  async fetch(request, env, ctx, fetchTts = fetch) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') {
      return errorResponse(405, 'Use POST with a JSON body: {"text": "..."}');
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return errorResponse(400, 'Body must be valid JSON: {"text": "..."}');
    }

    const text = cleanKoreanText(payload?.text);
    if (!text) {
      return errorResponse(400, 'Field "text" is required and must not be empty.');
    }
    if (text.length > MAX_TOTAL_CHARS) {
      return errorResponse(400, `Text is too long (max ${MAX_TOTAL_CHARS} characters).`);
    }

    const lang = typeof payload.lang === 'string' && payload.lang.trim() ? payload.lang.trim() : 'ko';
    const chunks = splitTextIntoChunks(text, MAX_CHARS_PER_CHUNK);

    const buffers = [];
    for (const chunk of chunks) {
      let upstream;
      try {
        upstream = await fetchTts(googleTtsUrl(chunk, lang), {
          headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://translate.google.com/' },
        });
      } catch {
        return errorResponse(502, 'Could not reach Google Translate TTS.');
      }
      if (!upstream.ok) {
        return errorResponse(502, `Google Translate TTS responded with ${upstream.status}.`);
      }
      buffers.push(new Uint8Array(await upstream.arrayBuffer()));
    }

    const totalLength = buffers.reduce((sum, buffer) => sum + buffer.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const buffer of buffers) {
      merged.set(buffer, offset);
      offset += buffer.length;
    }

    return new Response(merged, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': 'attachment; filename="korean-voice.mp3"',
        ...CORS_HEADERS,
      },
    });
  },
};
