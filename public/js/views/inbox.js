import { api, state } from '../api.js';
import { h, icon, avatar, toast, timeAgo, emptyState } from '../ui.js';

// Snapchat-style status markers: red = Snap, orange = chat; filled = new, outline = opened, arrow = sent.
function statusMarker(c) {
  const snap = c.unopenedSnap || c.lastKind === 'snap';
  const color = snap ? 'red' : 'orange';
  const labels = {
    new: c.unopenedSnap ? 'New Snap' : 'New Chat',
    received: 'Received',
    delivered: 'Delivered',
    opened: 'Opened',
    none: 'Tap to chat',
  };
  const shape = c.status === 'new' ? 'filled' : c.status === 'delivered' ? 'arrow filled' : c.status === 'opened' ? 'arrow' : c.status === 'received' ? 'outline' : 'none';
  return h('span', { class: `status ${color} ${c.status === 'new' ? 'bold' : ''}` },
    shape !== 'none' ? h('span', { class: `marker ${shape}` }) : null,
    labels[c.status], c.lastAt ? h('span', { class: 'muted' }, ` · ${timeAgo(c.lastAt)}`) : null);
}

export function renderInbox(view) {
  const list = h('div', { class: 'list' });
  const reqBanner = h('div');

  async function load() {
    try {
      const [{ items, unreadTotal }, reqs] = await Promise.all([api('/chats'), api('/friends/requests')]);
      state.set({ unread: unreadTotal, requests: reqs.incoming.length });
      reqBanner.replaceChildren(reqs.incoming.length
        ? h('a', { class: 'list-row req-banner', href: '#/friends' },
          h('span', { class: 'req-icon' }, icon('friends', { size: 22 })),
          h('div', { class: 'col grow' }, h('strong', {}, 'Friend requests'), h('span', { class: 'small muted' }, `${reqs.incoming.length} waiting for you`)),
          h('span', { class: 'badge static' }, String(reqs.incoming.length)))
        : '');
      list.replaceChildren(...(items.length ? items.map((c) => h('a', { class: 'list-row chat-row', href: `#/chat/${c.user.id}` },
        avatar(c.user, 50),
        h('div', { class: 'col grow' }, h('strong', {}, c.user.displayName), statusMarker(c)),
        h('span', { class: 'icon chat-cam' }, icon('camera', { size: 22 }))))
        : [emptyState('inbox', 'No chats yet', 'Add friends to start chatting. Only friends can message you on Ember.', h('a', { class: 'btn primary', href: '#/friends' }, 'Add friends'))]));
    } catch (e) { toast(e.message, 'error'); }
  }

  view.append(h('div', { class: 'page' },
    h('header', { class: 'page-head' }, h('span', { class: 'icon-btn' }), h('h1', {}, 'Chat'),
      h('a', { class: 'icon-btn', href: '#/friends', 'aria-label': 'Add friends' }, icon('friends'))),
    reqBanner, list));
  load();
  const onMsg = () => load();
  document.addEventListener('ember:message', onMsg);
  document.addEventListener('ember:read', onMsg);
  return () => { document.removeEventListener('ember:message', onMsg); document.removeEventListener('ember:read', onMsg); };
}
