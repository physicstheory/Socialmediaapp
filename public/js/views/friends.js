import { api, state, withPin } from '../api.js';
import { h, icon, avatar, toast, confirmDialog } from '../ui.js';
import { refreshCounts } from '../app.js';

export function renderFriends(view) {
  const user = state.user;
  const isKid = user.ageGroup === 'kid';
  const results = h('div', { class: 'list' });
  const requestsBox = h('div', { class: 'list' });
  const friendsBox = h('div', { class: 'list' });
  let searchTimer;

  const searchInput = h('input', {
    class: 'input search', type: 'search', placeholder: 'Search by username', autocapitalize: 'none',
    oninput: () => { clearTimeout(searchTimer); searchTimer = setTimeout(search, 300); },
  });

  async function search() {
    const q = searchInput.value.trim();
    if (q.length < 2) { results.replaceChildren(); return; }
    try {
      const { items } = await api('/friends/search', { query: { q } });
      results.replaceChildren(...(items.length ? items.map(searchRow) : [h('p', { class: 'muted small pad' }, 'No one found. Some people can only be added with their friend code.')]));
    } catch (e) { toast(e.message, 'error'); }
  }

  const searchRow = (r) => h('div', { class: 'list-row' },
    h('a', { href: `#/u/${r.user.username}`, class: 'row gap grow' }, avatar(r.user, 44),
      h('div', { class: 'col' }, h('strong', {}, r.user.displayName), h('span', { class: 'small muted' }, `@${r.user.username}${r.mutuals ? ` · ${r.mutuals} mutual` : ''}`))),
    r.status === 'none'
      ? h('button', { class: 'btn small primary', onclick: (e) => sendRequest({ username: r.user.username }, e.currentTarget) }, 'Add')
      : h('span', { class: 'small muted' }, { friends: 'Friends', sent: 'Requested', received: 'Respond in requests' }[r.status]));

  async function sendRequest(body, btn) {
    if (btn) btn.disabled = true;
    try {
      const res = await withPin((pin) => api('/friends/request', { method: 'POST', body: { ...body, pin } }), 'A parent needs to enter the PIN to add a friend.');
      toast(`Request sent to ${res.user.displayName}`);
      if (btn) btn.replaceWith(h('span', { class: 'small muted' }, 'Requested'));
      return true;
    } catch (e) {
      if (!e.cancelled) toast(e.message, 'error');
      if (btn) btn.disabled = false;
      return false;
    }
  }

  const codeInput = h('input', { class: 'input', placeholder: 'EMB-XXXXXX', autocapitalize: 'characters', maxlength: '10' });
  const codeForm = h('form', {
    class: 'row gap',
    onsubmit: async (e) => {
      e.preventDefault();
      if (!codeInput.value.trim()) return;
      if (await sendRequest({ code: codeInput.value })) codeInput.value = '';
    },
  }, codeInput, h('button', { class: 'btn primary small' }, 'Add'));

  const myCode = h('div', { class: 'code-card' },
    h('div', {}, h('span', { class: 'tiny muted' }, 'MY FRIEND CODE'), h('strong', { class: 'code' }, user.friendCode)),
    h('button', {
      class: 'btn small ghost',
      onclick: async () => {
        const text = `Add me on Ember! My friend code is ${user.friendCode}`;
        try {
          if (navigator.share) await navigator.share({ text });
          else { await navigator.clipboard.writeText(user.friendCode); toast('Friend code copied'); }
        } catch { /* cancelled */ }
      },
    }, icon('copy', { size: 16 }), ' Share'));

  async function loadRequests() {
    const { incoming, outgoing } = await api('/friends/requests');
    state.set({ requests: incoming.length });
    const rows = incoming.map((r) => h('div', { class: 'list-row request' },
      avatar(r.user, 44),
      h('div', { class: 'col grow' },
        h('strong', {}, r.user.displayName),
        h('span', { class: 'small muted' }, `@${r.user.username} · ${r.mutuals} mutual friend${r.mutuals === 1 ? '' : 's'}${r.viaCode ? ' · used your code' : ''}`),
        r.newAccount || r.mutuals === 0
          ? h('span', { class: 'warn small' }, icon('shield', { size: 14 }), r.newAccount ? ' New account — only accept if you know them in real life.' : ' No mutual friends — only accept people you know.')
          : null),
      h('div', { class: 'col gap-sm' },
        h('button', { class: 'btn small primary', onclick: () => respond(r, true) }, 'Accept'),
        h('button', { class: 'btn small ghost', onclick: () => respond(r, false) }, 'Decline'))));
    const out = outgoing.map((r) => h('div', { class: 'list-row' }, avatar(r.user, 36),
      h('span', { class: 'grow' }, r.user.displayName, h('span', { class: 'small muted' }, ' · pending')),
      h('button', { class: 'btn small ghost', onclick: async () => { await api(`/friends/requests/${r.id}`, { method: 'DELETE' }); loadRequests(); } }, 'Cancel')));
    requestsBox.replaceChildren(
      ...(rows.length ? rows : [h('p', { class: 'muted small pad' }, 'No new requests.')]),
      ...(out.length ? [h('h4', { class: 'sub' }, 'Sent'), ...out] : []));
  }

  async function respond(r, accept) {
    try {
      await withPin((pin) => api(`/friends/requests/${r.id}/${accept ? 'accept' : 'decline'}`, { method: 'POST', body: { pin } }), 'A parent needs to enter the PIN to accept.');
      toast(accept ? `You and ${r.user.displayName} are friends now 🔥` : 'Request declined');
      loadRequests(); loadFriends(); refreshCounts();
    } catch (e) { if (!e.cancelled) toast(e.message, 'error'); }
  }

  async function loadFriends() {
    const { items } = await api('/friends');
    friendsBox.replaceChildren(...(items.length ? items.map((f) => h('div', { class: 'list-row' },
      h('a', { href: `#/u/${f.username}`, class: 'row gap grow' }, avatar(f, 44), h('div', { class: 'col' }, h('strong', {}, f.displayName), h('span', { class: 'small muted' }, `@${f.username}`))),
      h('a', { class: 'btn small ghost', href: `#/chat/${f.id}` }, 'Chat'),
      h('button', {
        class: 'icon-btn', 'aria-label': 'Remove friend',
        onclick: async () => {
          if (!(await confirmDialog(`Remove ${f.displayName}?`, 'You won’t see each other’s private videos or be able to chat.', 'Remove', true))) return;
          await api(`/friends/${f.id}`, { method: 'DELETE' });
          loadFriends();
        },
      }, icon('close', { size: 18 })))) : [h('p', { class: 'muted small pad' }, 'No friends yet — share your code or search above.')]));
  }

  view.append(h('div', { class: 'page' },
    h('header', { class: 'page-head' }, h('h1', {}, 'Friends')),
    h('div', { class: 'safety-banner' }, icon('shield', { size: 20 }),
      h('span', { class: 'small' }, isKid
        ? 'Kids accounts add friends with a friend code and a parent’s PIN. Only add people you know in real life.'
        : user.ageGroup === 'teen'
          ? 'You can only find other teens. To add a parent or adult, enter their friend code.'
          : 'Ember keeps adults and under-18s apart. Only friends can message you.')),
    isKid ? null : h('section', {}, searchInput, results),
    h('section', {}, h('h3', {}, 'Add with a friend code'), codeForm, myCode),
    h('section', {}, h('h3', {}, 'Friend requests'), requestsBox),
    h('section', {}, h('h3', {}, 'Your friends'), friendsBox)));

  loadRequests().catch((e) => toast(e.message, 'error'));
  loadFriends().catch((e) => toast(e.message, 'error'));
}
