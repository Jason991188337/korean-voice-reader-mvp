# Korean Voice Reader MVP

A zero-server static web MVP that lets users:

- Type Korean text directly.
- Upload an image containing Korean text and extract it in the browser with Tesseract.js.
- Read the resulting Korean text aloud with the browser Web Speech API.
- Keep Yuna and Google Korean voice options at the top, then add extra recommended Korean browser voices when available.
- Display an estimated playback progress bar while speech is playing, with a draggable seek slider.
- Show estimated playback timing as `Estimated time 00:00 / 02:35` and seek to an
  estimated `mm:ss` time with a time input. Times are estimates derived from text
  length, speech rate, and line pauses — the Web Speech API does not report real
  playback position, so seeking restarts speech from the closest estimated text position.
- Generate Google Korean TTS MP3 links for the current text.
- Optionally download long text as ONE MP3 file through a free Cloudflare Worker.

## Run locally

```bash
npm test
npm start
```

Then open <http://localhost:4173>.

## Free deployment

This is a static site. Deploy the folder to one of these free static hosts:

- GitHub Pages
- Cloudflare Pages
- Netlify
- Vercel

No backend server, paid API key, or always-on local computer is required.

## Optional: single MP3 for long text (free Cloudflare Worker)

By default, long text produces multiple `korean-voice-part-N.mp3` links because the
Google Translate TTS endpoint only accepts short text per request. To get one MP3
file instead, deploy the included worker on the Cloudflare Workers **free plan**:

1. Install wrangler and log in (a free Cloudflare account is enough):

   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. Deploy the worker from this repo:

   ```bash
   cd cloudflare-worker
   wrangler deploy
   ```

   The output prints your worker URL, e.g.
   `https://korean-single-mp3.<your-account>.workers.dev`.

3. Paste that URL into `src/config.mjs`:

   ```js
   export const SINGLE_MP3_WORKER_URL = 'https://korean-single-mp3.<your-account>.workers.dev';
   ```

4. Redeploy the static site. The **Download Single MP3** button now downloads one
   MP3 file. While `SINGLE_MP3_WORKER_URL` is empty, the button falls back to the
   existing multi-part download links.

The worker splits the text into chunks, fetches Google Translate TTS for each chunk
server-side, and concatenates the MP3 bytes into a single response. Because that is
naive MP3 frame concatenation, players may show a slightly inaccurate total duration
and there can be tiny gaps at chunk boundaries — acceptable for listening, but not a
frame-accurate merge.

## Limitations

- OCR quality depends on image clarity.
- Voice quality and available voice variants depend on the visitor's browser/OS.
- Premium AI voice quality would require adding a paid or free-tier external TTS API later.
