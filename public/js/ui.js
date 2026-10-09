// Small DOM helpers. Everything user-provided is inserted as text (never innerHTML) to prevent XSS.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v; // only ever used with our own static SVG strings
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  friends: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-6 6.5-6s5.9 2.4 6.5 6"/><circle cx="17" cy="9" r="2.7"/><path d="M16.5 14.2c2.6.2 4.5 2.3 5 5.3"/>',
  inbox: '<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 4-6.5 8-6.5s7.2 2.5 8 6.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  heart: '<path d="M12 21s-7.5-4.6-9.5-9.3C1.1 8.2 3.3 4.5 7 4.5c2.1 0 3.6 1.1 5 2.9 1.4-1.8 2.9-2.9 5-2.9 3.7 0 5.9 3.7 4.5 7.2C19.5 16.4 12 21 12 21z"/>',
  comment: '<path d="M12 3.5c5 0 9 3.4 9 7.8s-4 7.7-9 7.7c-1 0-2-.1-2.9-.4L4 20.5l1.4-4C4 15 3 13.3 3 11.3 3 6.9 7 3.5 12 3.5z"/>',
  bookmark: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z"/>',
  share: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  back: '<path d="M15 4 7 12l8 8"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  send: '<path d="M4 12 20 4l-5 16-3-7z"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>',
  sound: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="m17 9 5 6M22 9l-5 6"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  block: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  upload: '<path d="M12 16V4M6 10l6-6 6 6M4 20h16"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  eyeoff: '<path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4 9.5 6a13 13 0 0 1-2.6 3.4M6.6 6.6C4.4 8 3 10.2 2.5 12c1 2 4.5 6 9.5 6 1.6 0 3-.4 4.3-1"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
};
const FILLED = new Set(['heart', 'bookmark', 'more', 'play', 'comment']);

export function icon(name, { size = 24, fill = FILLED.has(name), cls = '' } = {}) {
  const span = document.createElement('span');
  span.className = `icon ${cls}`;
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" ${fill ? 'fill="currentColor" stroke="none"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}>${ICONS[name] || ''}</svg>`;
  return span;
}

export const LOGO_SVG = `<svg viewBox="12 0 40 50" aria-hidden="true"><path fill="#FF9500" transform="translate(-2.5 -1.5)" d="M33 4c3 9 13 14 13 28a14 14 0 0 1-28 0c0-6 3-10 6-13 0 5 2 8 5 9-2-9 1-17 4-24z"/><path fill="#FF2D2D" transform="translate(2.5 1.5)" d="M33 4c3 9 13 14 13 28a14 14 0 0 1-28 0c0-6 3-10 6-13 0 5 2 8 5 9-2-9 1-17 4-24z"/><path fill="#fff" d="M33 4c3 9 13 14 13 28a14 14 0 0 1-28 0c0-6 3-10 6-13 0 5 2 8 5 9-2-9 1-17 4-24z"/></svg>`;

export function logo(size = 64) {
  return h('span', { class: 'logo', style: { width: `${size}px`, height: `${size}px`, padding: `${Math.round(size * 0.16)}px` }, html: LOGO_SVG });
}

export function avatar(user, size = 40) {
  const initial = (user?.displayName || user?.username || '?').trim()[0]?.toUpperCase() || '?';
  return h('span', {
    class: 'avatar',
    style: { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.42)}px`, background: user?.avatarColor || '#FF3B30' },
    'aria-hidden': 'true',
  }, initial);
}

let toastTimer;
export function toast(msg, kind = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 3200);
}

/** Bottom sheet (TikTok style). Returns close(). */
export function sheet(title, content, { tall = false, onClose } = {}) {
  const root = $('#overlay-root');
  const close = () => {
    wrap.classList.remove('open');
    setTimeout(() => wrap.remove(), 220);
    onClose?.();
  };
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e) => { if (e.target === wrap) close(); } },
    h('div', { class: `sheet ${tall ? 'tall' : ''}`, role: 'dialog', 'aria-label': title },
      h('div', { class: 'sheet-head' },
        h('span', {}, title),
        h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, icon('close', { size: 20 }))),
      h('div', { class: 'sheet-body' }, content)));
  root.append(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
  return close;
}

/** Centered modal dialog. Returns close(). */
export function modal(content, { dismissable = true, cls = '' } = {}) {
  const root = $('#overlay-root');
  const close = () => { wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 200); };
  const wrap = h('div', { class: 'modal-wrap', onclick: (e) => { if (dismissable && e.target === wrap) close(); } },
    h('div', { class: `modal ${cls}`, role: 'dialog' }, content));
  root.append(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
  return close;
}

export function confirmDialog(title, body, okLabel = 'OK', danger = false) {
  return new Promise((resolve) => {
    let close;
    const done = (v) => { close(); resolve(v); };
    close = modal([
      h('h3', {}, title),
      body ? h('p', { class: 'muted' }, body) : null,
      h('div', { class: 'row gap' },
        h('button', { class: 'btn ghost', onclick: () => done(false) }, 'Cancel'),
        h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => done(true) }, okLabel)),
    ]);
  });
}

export function askPin(message = 'Enter the parent / settings PIN') {
  return new Promise((resolve) => {
    let close;
    const input = h('input', { class: 'input pin-input', type: 'password', inputmode: 'numeric', maxlength: '6', autocomplete: 'off', placeholder: '••••' });
    const done = (v) => { close(); resolve(v); };
    close = modal([
      h('div', { class: 'center' }, icon('lock', { size: 32 })),
      h('h3', { class: 'center' }, 'PIN required'),
      h('p', { class: 'muted center' }, message),
      h('form', { onsubmit: (e) => { e.preventDefault(); done(input.value); } },
        input,
        h('div', { class: 'row gap' },
          h('button', { type: 'button', class: 'btn ghost', onclick: () => done(null) }, 'Cancel'),
          h('button', { type: 'submit', class: 'btn primary' }, 'Unlock'))),
    ], { dismissable: false });
    setTimeout(() => input.focus(), 50);
  });
}

export function timeAgo(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(ts).toLocaleDateString();
}

export function compact(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

export function toggle(checked, onChange, { disabled = false, label = '' } = {}) {
  const input = h('input', { type: 'checkbox', role: 'switch', 'aria-label': label, disabled });
  input.checked = Boolean(checked);
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: `switch ${disabled ? 'disabled' : ''}` }, input, h('span', { class: 'slider' }));
}

export function emptyState(iconName, title, text, ...actions) {
  return h('div', { class: 'empty' },
    h('div', { class: 'empty-icon' }, icon(iconName, { size: 40 })),
    h('h3', {}, title),
    text ? h('p', { class: 'muted' }, text) : null,
    actions.length ? h('div', { class: 'col gap' }, actions) : null);
}
