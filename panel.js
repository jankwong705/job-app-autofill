// panel.js — the human-in-the-loop review UI.

let answers = {};      // { key: {value, description, sensitive} }
let scraped = [];      // fields from the page
let proposals = [];    // per-field { field, key, value, confidence, accepted }

const $ = (id) => document.getElementById(id);
const statusEl = $('status');

// Load the answer store from extension storage, falling back to the bundled default.
async function loadAnswers() {
  const stored = await chrome.storage.local.get('answers');
  if (stored.answers) return stored.answers;
  const res = await fetch(chrome.runtime.getURL('answers.example.json'));
  const json = await res.json();
  // Flatten the grouped example into { key: {...} }.
  const flat = {};
  for (const group of Object.values(json.groups)) {
    for (const [key, entry] of Object.entries(group)) flat[key] = entry;
  }
  return flat;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function confClass(c) { return c >= 0.75 ? 'high' : c >= 0.4 ? 'med' : 'low'; }

function render() {
  const container = $('fields');
  container.innerHTML = '';
  let anyAccepted = false;

  proposals.forEach((p, idx) => {
    const div = document.createElement('div');
    div.className = 'field';
    const conf = Math.round((p.confidence ?? 0) * 100);
    const sensitive = p.key && answers[p.key]?.sensitive;

    div.innerHTML = `
      <div class="label">${p.field.label || p.field.name || p.field.placeholder || '(unlabeled field)'}
        ${p.key ? `<span class="conf ${confClass(p.confidence)}">${conf}%</span>` : '<span class="skip">no match</span>'}
        ${sensitive ? '<span class="conf med">sensitive</span>' : ''}
      </div>
      <div class="meta">${p.field.type}${p.field.name ? ' · ' + p.field.name : ''}${p.key ? ' → ' + p.key : ''}</div>
      <input type="text" data-idx="${idx}" value="${(p.value ?? '').toString().replace(/"/g, '&quot;')}" placeholder="value to fill" />
      <label class="chk"><input type="checkbox" data-accept="${idx}" ${p.accepted ? 'checked' : ''}/> fill this</label>
    `;
    container.appendChild(div);
    if (p.accepted) anyAccepted = true;
  });

  container.querySelectorAll('input[type=text]').forEach(inp => {
    inp.addEventListener('input', e => {
      proposals[+e.target.dataset.idx].value = e.target.value;
    });
  });
  container.querySelectorAll('input[data-accept]').forEach(chk => {
    chk.addEventListener('change', e => {
      proposals[+e.target.dataset.accept].accepted = e.target.checked;
      $('fill').disabled = !proposals.some(p => p.accepted);
    });
  });

  $('fill').disabled = !anyAccepted;
}

$('scan').addEventListener('click', async () => {
  try {
    statusEl.textContent = 'Scanning page…';
    answers = await loadAnswers();
    const tab = await activeTab();

    const { fields } = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE' });
    scraped = fields || [];
    if (!scraped.length) { statusEl.textContent = 'No fillable fields found.'; return; }

    statusEl.textContent = `Found ${scraped.length} fields. Matching with Gemini…`;
    const answerKeys = Object.entries(answers).map(([key, v]) => ({
      key, description: v.description || key
    }));

    const resp = await chrome.runtime.sendMessage({ type: 'MATCH', fields: scraped, answerKeys });
    if (!resp.ok) { statusEl.textContent = 'Match error: ' + resp.error; return; }

    const byIndex = new Map(resp.matches.map(m => [m.i, m]));
    proposals = scraped.map((field, i) => {
      const m = byIndex.get(i);
      const key = m?.key || null;
      const entry = key ? answers[key] : null;
      const confidence = m?.confidence ?? 0;
      // Auto-accept confident, non-sensitive matches; leave the rest for review.
      const accepted = !!(entry && !entry.sensitive && confidence >= 0.75);
      return { field, key, value: entry?.value ?? '', confidence, accepted };
    });

    statusEl.textContent = `Review ${proposals.length} fields, then Fill selected.`;
    render();
  } catch (e) {
    statusEl.textContent = 'Error: ' + (e.message || e) + ' (reload the page and retry)';
  }
});

$('fill').addEventListener('click', async () => {
  const items = proposals
    .filter(p => p.accepted && p.value !== '')
    .map(p => ({ selector: p.field.selector, value: p.value }));
  if (!items.length) return;
  const tab = await activeTab();
  const { filled } = await chrome.tabs.sendMessage(tab.id, { type: 'FILL', items });
  statusEl.textContent = `Filled ${filled} fields. Review the page, then submit yourself.`;
});
