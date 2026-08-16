# Korean Voice Reader MVP

A zero-server static web MVP that lets users:

- Type Korean text directly.
- Upload an image containing Korean text and extract it in the browser with Tesseract.js.
- Read the resulting Korean text aloud with the browser Web Speech API.
- Show up to 10 recommended Korean browser voices when available, then adjust rate/pitch.
- Display an estimated playback progress bar while speech is playing.
- Generate Google Korean TTS MP3 links for the current text.

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

## Limitations

- OCR quality depends on image clarity.
- Voice quality and available voice variants depend on the visitor's browser/OS.
- Premium AI voice quality would require adding a paid or free-tier external TTS API later.
