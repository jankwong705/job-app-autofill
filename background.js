// background.js  (service worker, type: module)
// Handles the LLM field-matching call. Swap PROVIDER internals if you change LLMs.

import { GEMINI_API_KEY, GEMINI_MODEL } from './config.js';

// Open the side panel when the toolbar icon is clicked.
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Build the prompt: given scraped fields + the answer-store keys, return a mapping.
function buildPrompt(fields, answerKeys) {
  return `You match form fields to a person's saved answer keys.

SAVED ANSWER KEYS (with descriptions):
${answerKeys.map(k => `- ${k.key}: ${k.description}`).join('\n')}

FORM FIELDS (JSON):
${JSON.stringify(fields.map((f, i) => ({
    i,
    label: f.label,
    name: f.name,
    placeholder: f.placeholder,
    type: f.type,
    options: f.options || undefined
  })), null, 2)}

For each form field, choose the single best matching answer key, or null if none fits.
Return ONLY valid JSON, no prose, in this exact shape:
{"matches":[{"i":<field index>,"key":<answer key or null>,"confidence":<0..1>}]}`;
}

async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' }
    })
  });
  if (!res.ok) {
    throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  return JSON.parse(text);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'MATCH') {
    (async () => {
      try {
        if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
          throw new Error('No Gemini API key set. Add it in config.js.');
        }
        const prompt = buildPrompt(msg.fields, msg.answerKeys);
        const result = await callGemini(prompt);
        sendResponse({ ok: true, matches: result.matches || [] });
      } catch (e) {
        sendResponse({ ok: false, error: String(e.message || e) });
      }
    })();
    return true; // async
  }
});
