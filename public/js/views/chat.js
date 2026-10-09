import { api, state } from '../api.js';
import { h, icon, avatar, toast, sheet, confirmDialog, timeAgo } from '../ui.js';
import { navigate, refreshCounts } from '../app.js';
import { openPostViewer } from './feed.js';

const REPORT_REASONS = ['Bullying or harassment', 'Asking for photos or personal info', 'Asking to meet up', 'Sexual content', 'Threats or violence', 'Spam or scam', 'Something else'];

/** Resize a photo on a canvas: makes it smaller and strips EXIF data like GPS location. */
async function prepareSnap(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
}

export async function renderChat(view, userId) {
  const me = state.user;
  const disappearingKey = `ember:disappear:${userId}`;
  let disappearing = localStorage.getItem(disappearingKey) !== 'off';
  const msgs = h('div', { class: 'messages' });
  const timerBtn = h('button', { class: 'icon-btn', 'aria-label': 'Disappearing messages' });
  const input = h('input', { class: 'input', placeholder: 'Send a chat', maxlength: '1000', enterkeyhint: 'send' });
  const fileInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  let other = null;

  function drawTimer() {
    timerBtn.classList.toggle('accent', disappearing);
    timerBtn.replaceChildren(icon('timer', { size: 22 }));
    timerBtn.title = disappearing ? 'Chats disappear 24h after viewing' : 'Chats are kept';
  }
  timerBtn.addEventListener('click', () => {
    disappearing = !disappearing;
    localStorage.setItem(disappearingKey, disappearing ? 'on' : 'off');
    drawTimer();
    toast(disappearing ? 'New chats disappear 24h after they’re viewed' : 'New chats will be kept');
  });
  drawTimer();

  const bubble = (m) => {
    const mine = m.mine;
    let content;
    if (m.kind === 'snap') {
      content = mine
        ? h('div', { class: 'snap-tile sent' }, icon('send', { size: 18 }), m.openedAt ? ' Opened' : ' Snap delivered')
        : m.snapAvailable
          ? h('button', { class: 'snap-tile new', onclick: () => viewSnap(m) }, h('span', { class: 'marker filled' }), ' Tap to view Snap')
          : h('div', { class: 'snap-tile' }, h('span', { class: 'marker outline' }), ' Opened');
    } else if (m.kind === 'post') {
      content = h('div', { class: 'col gap-sm' },
        m.post
          ? h('button', { class: 'post-card', onclick: () => openPostViewer([m.post]) },
            m.post.thumbnailUrl ? h('img', { src: m.post.thumbnailUrl, alt: '' }) : h('span', { class: 'post-card-icon' }, icon('play', { size: 28 })),
            h('div', { class: 'col' }, h('strong', { class: 'small' }, `@${m.post.author.username}`), h('span', { class: 'small' }, m.post.caption || m.post.tiktokTitle || 'Video')))
          : h('div', { class: 'post-card unavailable small muted' }, 'This video isn’t available to you.'),
        m.text ? h('span', {}, m.text) : null);
    } else {
      content = h('span', {}, m.text);
    }
    return h('div', { class: `msg ${mine ? 'mine' : 'theirs'} ${m.saved ? 'saved' : ''}`, onclick: () => (m.kind !== 'snap' || !mine) && msgMenu(m) },
      h('span', { class: 'msg-who' }, mine ? 'ME' : other.displayName.toUpperCase()),
      h('div', { class: 'msg-body' }, content),
      h('span', { class: 'msg-meta tiny' }, timeAgo(m.createdAt), m.saved ? ' · Saved' : m.ephemeral ? ' · ⏱' : ''));
  };

  function msgMenu(m) {
    let close;
    const items = [];
    if (m.kind !== 'snap') items.push(h('button', { class: 'menu-item', onclick: async () => { close(); await api(`/messages/${m.id}/save`, { method: 'POST' }); load(); } }, icon('bookmark', { size: 20 }), m.saved ? 'Unsave in chat' : 'Save in chat'));
    if (!m.mine) items.push(h('button', { class: 'menu-item danger', onclick: () => { close(); report(m); } }, icon('flag', { size: 20 }), 'Report message'));
    if (items.length) close = sheet('Message', h('div', { class: 'menu' }, items));
  }

  function report(m) {
    let close;
    close = sheet('What’s wrong?', h('div', { class: 'menu' }, REPORT_REASONS.map((r) => h('button', {
      class: 'menu-item',
      onclick: async () => {
        close();
        if (m) await api(`/messages/${m.id}/report`, { method: 'POST', body: { reason: r } }).catch(() => {});
        else await api(`/users/${userId}/report`, { method: 'POST', body: { reason: r, block: false } }).catch(() => {});
        if (await confirmDialog('Thanks for telling us', `Do you also want to block ${other.displayName}? They won’t be able to find or message you.`, 'Block', true)) {
          await api(`/users/${userId}/block`, { method: 'POST' });
          toast('Blocked');
          navigate('inbox');
        } else toast('Report sent. The message is saved for review.');
      },
    }, r))));
  }

  async function viewSnap(m) {
    try {
      const r = await fetch(`/api/snaps/${m.id}`, { credentials: 'same-origin' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Snap unavailable');
      const url = URL.createObjectURL(await r.blob());
      let seconds = 10;
      const counter = h('span', { class: 'snap-count' }, String(seconds));
      const closeSnap = () => { clearInterval(t); URL.revokeObjectURL(url); overlay.remove(); load(); };
      const overlay = h('div', { class: 'snap-viewer', onclick: closeSnap },
        h('img', { src: url, alt: 'Snap' }),
        h('div', { class: 'snap-top' }, avatar(other, 32), h('strong', {}, other.displayName), counter),
        h('button', { class: 'btn small ghost light snap-report', onclick: (e) => { e.stopPropagation(); closeSnap(); report(m); } }, icon('flag', { size: 14 }), ' Report'));
      const t = setInterval(() => { seconds--; counter.textContent = String(seconds); if (seconds <= 0) closeSnap(); }, 1000);
      document.getElementById('overlay-root').append(overlay);
    } catch (e) { toast(e.message, 'error'); load(); }
  }

  async function load() {
    try {
      const data = await api(`/chats/${userId}`);
      other = data.user;
      head.replaceChildren(
        h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => navigate('inbox') }, icon('back')),
        h('a', { class: 'row gap grow', href: `#/u/${other.username}` }, avatar(other, 36), h('strong', {}, other.displayName)),
        timerBtn,
        h('button', { class: 'icon-btn', 'aria-label': 'More', onclick: chatMenu }, icon('more')));
      const atBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80;
      msgs.replaceChildren(
        h('p', { class: 'tiny muted center chat-note' }, icon('shield', { size: 12 }), disappearing
          ? ' Chats disappear 24h after they’re viewed. Tap a message to save or report it.'
          : ' Tap a message to save or report it.'),
        ...data.items.map(bubble));
      if (atBottom || !msgs.dataset.loaded) msgs.scrollTop = msgs.scrollHeight;
      msgs.dataset.loaded = '1';
      refreshCounts();
    } catch (e) {
      toast(e.message, 'error');
      navigate('inbox');
    }
  }

  function chatMenu() {
    let close;
    close = sheet(other.displayName, h('div', { class: 'menu' },
      h('a', { class: 'menu-item', href: `#/u/${other.username}`, onclick: () => close() }, icon('profile', { size: 20 }), 'View profile'),
      h('button', { class: 'menu-item danger', onclick: () => { close(); report(null); } }, icon('flag', { size: 20 }), 'Report'),
      h('button', {
        class: 'menu-item danger',
        onclick: async () => {
          close();
          if (!(await confirmDialog(`Block ${other.displayName}?`, 'They won’t be able to find you, see your videos or message you.', 'Block', true))) return;
          await api(`/users/${userId}/block`, { method: 'POST' });
          toast('Blocked');
          navigate('inbox');
        },
      }, icon('block', { size: 20 }), 'Block')));
  }

  async function send(e) {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try {
      const { notices } = await api(`/chats/${userId}`, { method: 'POST', body: { text, ephemeral: disappearing } });
      notices?.forEach((n) => toast(n));
      load();
    } catch (err) {
      input.value = text;
      toast(err.message, 'error');
    }
  }

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    fileInput.value = '';
    if (!f) return;
    try {
      const blob = await prepareSnap(f);
      const url = URL.createObjectURL(blob);
      let closePrev;
      const sendBtn = h('button', {
        class: 'btn primary',
        onclick: async () => {
          sendBtn.disabled = true;
          try {
            await api(`/chats/${userId}/snap`, { method: 'POST', raw: blob, contentType: 'image/jpeg' });
            toast('Snap sent 🔥');
            closePrev();
            load();
          } catch (err) { toast(err.message, 'error'); sendBtn.disabled = false; }
        },
      }, icon('send', { size: 18 }), ` Send to ${other.displayName}`);
      const prev = h('div', { class: 'snap-viewer preview' },
        h('img', { src: url, alt: 'Preview' }),
        h('div', { class: 'snap-actions' }, h('button', { class: 'btn ghost light', onclick: () => closePrev() }, 'Cancel'), sendBtn),
        h('p', { class: 'tiny center snap-hint' }, 'Snaps can be viewed once. Location data is removed.'));
      closePrev = () => { URL.revokeObjectURL(url); prev.remove(); };
      document.getElementById('overlay-root').append(prev);
    } catch { toast('Couldn’t open that photo', 'error'); }
  });

  const head = h('header', { class: 'chat-head' });
  view.append(h('div', { class: 'chat' }, head, msgs,
    h('form', { class: 'chat-input', onsubmit: send },
      me.settings.photoSnaps ? h('button', { type: 'button', class: 'icon-btn cam', 'aria-label': 'Send a Snap', onclick: () => fileInput.click() }, icon('camera', { size: 24 })) : null,
      input, fileInput,
      h('button', { class: 'icon-btn accent', 'aria-label': 'Send' }, icon('send')))));
  await load();
  const onMsg = () => load();
  document.addEventListener('ember:message', onMsg);
  document.addEventListener('ember:read', onMsg);
  return () => { document.removeEventListener('ember:message', onMsg); document.removeEventListener('ember:read', onMsg); };
}
