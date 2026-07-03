# Application Autofill (Human-in-the-Loop)

A Chrome extension that scans an online application form, uses Google Gemini to
match each field to your saved answers, and lets you **review every value before
it fills anything**. It never clicks submit.

## How it works

1. **Scan** – a content script reads all fillable fields on the page and the text
   around each one (label, name, placeholder, options).
2. **Match** – the background worker sends those fields plus your answer keys to
   Gemini in one call and gets back a `field → answer` mapping with confidence
   scores.
3. **Review** – the side panel shows each proposed fill. Confident, non-sensitive
   matches are pre-checked; everything else waits for you. Edit any value, check
   or uncheck, then click **Fill selected**.
4. **Fill** – the content script sets the values and fires input/change events so
   React/Vue forms register them. You review the page and submit yourself.

## Setup

1. **Clone** this repo.
2. **Add your Gemini key** (free): get one at https://aistudio.google.com/apikey,
   then `cp config.example.js config.js` and paste your key into `config.js`.
   (`config.js` is git-ignored so your key is never committed.)
3. **Add your answers**: edit `answers.example.json` with your details, or set an
   `answers` object in the extension's storage. Fields marked `"sensitive": true`
   (the voluntary EEO section) never auto-fill and always require a manual check.
4. **Load the extension**:
   - Open `chrome://extensions`
   - Turn on **Developer mode** (top right)
   - Click **Load unpacked** and select this folder.
5. Open an application page, click the extension icon to open the panel, and hit
   **Scan this page**.

Works in Chrome, Edge, Brave, and Arc. Each user needs their own free Gemini key.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | MV3 config, permissions, side panel |
| `content.js` | Scrapes fields and injects values |
| `background.js` | Calls the Gemini API for field matching |
| `panel.html` / `panel.js` | Review UI (the human-in-the-loop step) |
| `answers.example.json` | Template answer store |
| `config.example.js` | Template for your API key |

## Notes & next steps

- **File uploads (resume)** can't be auto-filled by a page script — do those manually.
- **Multi-step forms**: scan again after each step.
- To improve matching, add `description` text or extra phrasings to each answer key.
- Swap LLMs by editing `background.js` `callGemini` — the rest is provider-agnostic.
- Consider building a small options page later so users edit answers in a UI
  instead of JSON.
