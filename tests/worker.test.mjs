import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../cloudflare-worker/worker.js';

function jsonRequest(body, method = 'POST') {
  return new Request('https://tts.example.workers.dev/', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

test('worker answers CORS preflight OPTIONS requests', async () => {
  const response = await worker.fetch(new Request('https://tts.example.workers.dev/', { method: 'OPTIONS' }));

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.match(response.headers.get('Access-Control-Allow-Methods'), /POST/);
});

test('worker rejects non-POST methods with 405', async () => {
  const response = await worker.fetch(new Request('https://tts.example.workers.dev/', { method: 'GET' }));
  assert.equal(response.status, 405);
});

test('worker rejects missing text with 400', async () => {
  const response = await worker.fetch(jsonRequest({ text: '   ' }));
  assert.equal(response.status, 400);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
});

test('worker rejects invalid JSON body with 400', async () => {
  const response = await worker.fetch(new Request('https://tts.example.workers.dev/', {
    method: 'POST',
    body: 'not json',
  }));
  assert.equal(response.status, 400);
});

test('worker concatenates chunk audio into a single MP3 response', async () => {
  const requestedUrls = [];
  const fetchTts = async (url) => {
    requestedUrls.push(url);
    const index = requestedUrls.length;
    return new Response(new Uint8Array([index, index, index]), {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' },
    });
  };

  const longText = '안녕하세요. 좋은 아침입니다. '.repeat(20);
  const response = await worker.fetch(jsonRequest({ text: longText }), {}, {}, fetchTts);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'audio/mpeg');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.ok(requestedUrls.length > 1);
  for (const url of requestedUrls) {
    assert.match(url, /^https:\/\/translate\.google\.com\/translate_tts\?/);
    assert.match(url, /tl=ko/);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(bytes.length, requestedUrls.length * 3);
  assert.deepEqual([...bytes.slice(0, 3)], [1, 1, 1]);
});

test('worker returns 502 when the upstream TTS fetch fails', async () => {
  const fetchTts = async () => new Response('blocked', { status: 403 });
  const response = await worker.fetch(jsonRequest({ text: '안녕하세요.' }), {}, {}, fetchTts);

  assert.equal(response.status, 502);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
});
