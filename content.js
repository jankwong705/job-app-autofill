// content.js
// Runs in the page. Two jobs:
//   1) SCRAPE  – collect every fillable field + the text signals around it.
//   2) FILL    – set values on approved fields and fire events so JS frameworks notice.

const FILLABLE = 'input, select, textarea';

// Input types we never touch.
const SKIP_TYPES = new Set([
  'hidden', 'submit', 'button', 'reset', 'image', 'file', 'password'
]);

// Find the best human-readable label for a field.
function labelFor(el) {
  // 1) <label for="..."> matching the id OR the name.
  //    Many React forms (Ashby, etc.) point `for` at the field's name, not its id.
  for (const ref of [el.id, el.name]) {
    if (!ref) continue;
    const l = document.querySelector(`label[for="${CSS.escape(ref)}"]`);
    if (l && l.innerText.trim()) return l.innerText.trim();
  }
  // 2) wrapping <label>
  const wrap = el.closest('label');
  if (wrap && wrap.innerText.trim()) return wrap.innerText.trim();
  // 3) aria-label / aria-labelledby
  if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
  const labelledby = el.getAttribute('aria-labelledby');
  if (labelledby) {
    const ref = document.getElementById(labelledby);
    if (ref && ref.innerText.trim()) return ref.innerText.trim();
  }
  // 4) nearest preceding text — check the field's own previous sibling AND
  //    the wrapper's, since the input is often nested in a <div> under the label.
  for (const start of [el, el.parentElement]) {
    const prev = start && start.previousElementSibling;
    if (prev && prev.innerText && prev.innerText.trim().length < 120) {
      return prev.innerText.trim();
    }
  }
  return '';
}

// Reliable visibility test. offsetParent is null for many *visible* elements
// (position:fixed ancestors, transform/contain containers), so don't rely on it.
function isVisible(el) {
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

// Stable-ish selector so we can find the element again at fill time.
function selectorFor(el, index) {
  if (el.id) return `#${CSS.escape(el.id)}`;
  if (el.name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(el.name)}"]`;
  el.setAttribute('data-autofill-idx', String(index));
  return `[data-autofill-idx="${index}"]`;
}

function scrape() {
  const fields = [];
  document.querySelectorAll(FILLABLE).forEach((el, index) => {
    const type = (el.getAttribute('type') || el.tagName.toLowerCase());
    if (SKIP_TYPES.has(type)) return;
    if (el.disabled || el.readOnly) return;
    if (!isVisible(el)) return;

    const field = {
      selector: selectorFor(el, index),
      tag: el.tagName.toLowerCase(),
      type,
      label: labelFor(el),
      name: el.name || '',
      id: el.id || '',
      placeholder: el.getAttribute('placeholder') || '',
      value: el.value || ''
    };

    if (el.tagName.toLowerCase() === 'select') {
      field.options = Array.from(el.options).map(o => o.text.trim()).filter(Boolean);
    }
    fields.push(field);
  });
  return fields;
}

// Set a value and let React/Vue/etc. register the change.
function setValue(el, value) {
  const tag = el.tagName.toLowerCase();

  if (tag === 'select') {
    const wanted = String(value).toLowerCase();
    const match = Array.from(el.options).find(
      o => o.text.trim().toLowerCase() === wanted || o.value.toLowerCase() === wanted
    );
    if (match) el.value = match.value;
  } else if (el.type === 'checkbox') {
    el.checked = /^(true|yes|1|on)$/i.test(String(value));
  } else if (el.type === 'radio') {
    if (String(el.value).toLowerCase() === String(value).toLowerCase()) el.checked = true;
  } else {
    // Use the native setter so React's synthetic events fire correctly.
    const proto = tag === 'textarea'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
  }

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
}

function fill(items) {
  let filled = 0;
  for (const { selector, value } of items) {
    const el = document.querySelector(selector);
    if (!el) continue;
    try {
      setValue(el, value);
      el.style.outline = '2px solid #4caf50';
      setTimeout(() => { el.style.outline = ''; }, 1500);
      filled++;
    } catch (e) {
      console.warn('autofill: could not fill', selector, e);
    }
  }
  return filled;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SCRAPE') {
    sendResponse({ fields: scrape() });
  } else if (msg.type === 'FILL') {
    sendResponse({ filled: fill(msg.items) });
  }
  return true;
});
