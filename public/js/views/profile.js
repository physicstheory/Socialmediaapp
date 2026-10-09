import { api, state } from '../api.js';
import { h, icon, avatar, toast, sheet, compact, confirmDialog, emptyState, modal } from '../ui.js';
import { navigate } from '../app.js';
import { openPostViewer } from './feed.js';

function grid(posts) {
  if (!posts.length) return null;
  return h('div', { class: 'grid' }, posts.map((p, i) => h('button', { class: 'grid-item', onclick: () => openPostViewer(posts, i) },
    p.thumbnailUrl ? h('img', { src: p.thumbnailUrl, alt: '', loading: 'lazy' })
      : p.videoUrl ? h('video', { src: `${p.videoUrl}#t=0.5`, muted: true, preload: 'metadata', playsinline: true })
        : h('span', { class: 'grid-tt' }, icon('play', { size: 28 }), 'TikTok'),
    h('span', { class: 'grid-likes' }, icon('heart', { size: 12 }), ` ${compact(p.likes)}`))));
}

function editProfile(onSaved) {
  const u = state.user;
  const name = h('input', { class: 'input', maxlength: '30', value: u.displayName });
  const bio = h('textarea', { class: 'input', maxlength: '120', rows: '3' });
  bio.value = u.bio || '';
  let close;
  close = modal(h('form', {
    class: 'col gap',
    onsubmit: async (e) => {
      e.preventDefault();
      try {
        const { user } = await api('/me/profile', { method: 'PUT', body: { displayName: name.value, bio: bio.value } });
        state.set({ user });
        close();
        onSaved();
      } catch (err) { toast(err.message, 'error'); }
    },
  }, h('h3', {}, 'Edit profile'),
  h('label', { class: 'field' }, h('span', {}, 'Name'), name),
  h('label', { class: 'field' }, h('span', {}, 'Bio'), bio),
  h('div', { class: 'row gap' }, h('button', { type: 'button', class: 'btn ghost', onclick: () => close() }, 'Cancel'), h('button', { class: 'btn primary' }, 'Save'))));
}

export async function renderProfile(view, username) {
  const me = state.user;
  const target = username || me.username;
  let data;
  try {
    data = await api(`/users/${encodeURIComponent(target)}`);
  } catch (e) {
    view.append(h('div', { class: 'page' }, h('header', { class: 'page-head' }, h('button', { class: 'icon-btn', onclick: () => history.back() }, icon('back'))), emptyState('profile', 'User not found', e.message)));
    return;
  }
  const { user } = data;
  const isMe = data.me;
  const body = h('div', { class: 'profile-posts' });

  const showTab = async (which) => {
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.t === which));
    if (which === 'saved') {
      const { items } = await api('/saved');
      body.replaceChildren(grid(items) || emptyState('bookmark', 'Nothing saved yet', 'Tap the bookmark on a video to save it here.'));
    } else {
      body.replaceChildren(data.privateLocked
        ? emptyState('lock', 'This account is private', 'Become friends to see their videos.')
        : grid(data.posts) || emptyState('play', isMe ? 'Share your first video' : 'No videos yet', isMe ? 'Post a TikTok link or upload a clip for your friends.' : null,
          isMe ? h('a', { class: 'btn primary', href: '#/create' }, 'Create') : null));
    }
  };
  const tabs = h('div', { class: 'profile-tabs' },
    h('button', { 'data-t': 'videos', onclick: () => showTab('videos') }, icon('play', { size: 18 }), ' Videos'),
    isMe ? h('button', { 'data-t': 'saved', onclick: () => showTab('saved') }, icon('bookmark', { size: 18 }), ' Saved') : null);

  let actions;
  if (isMe) {
    actions = h('div', { class: 'row gap center-row' },
      h('button', { class: 'btn ghost', onclick: () => editProfile(() => navigate('profile')) }, 'Edit profile'),
      h('a', { class: 'btn ghost', href: '#/friends' }, 'Friend code'));
  } else {
    const friendBtn = data.isFriend
      ? h('a', { class: 'btn primary', href: `#/chat/${user.id}` }, 'Message')
      : data.pending === 'sent' ? h('button', { class: 'btn ghost', disabled: true }, 'Requested')
        : data.pending === 'received' ? h('a', { class: 'btn primary', href: '#/friends' }, 'Respond to request')
          : h('button', {
            class: 'btn primary',
            onclick: async (e) => {
              const btn = e.currentTarget;
              try { await api('/friends/request', { method: 'POST', body: { username: user.username } }); btn.textContent = 'Requested'; btn.disabled = true; } catch (err) { toast(err.message, 'error'); }
            },
          }, 'Add friend');
    actions = h('div', { class: 'row gap center-row' }, friendBtn,
      h('button', { class: 'btn ghost icon-only', 'aria-label': 'More', onclick: () => moreMenu(user) }, icon('more', { size: 20 })));
  }

  view.append(h('div', { class: 'page profile' },
    h('header', { class: 'page-head' },
      isMe ? h('span', { class: 'icon-btn' }) : h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => history.back() }, icon('back')),
      h('h1', {}, user.displayName),
      isMe ? h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': 'Settings' }, icon('settings')) : h('span', { class: 'icon-btn' })),
    h('div', { class: 'profile-top' },
      avatar(user, 96),
      h('p', { class: 'handle' }, `@${user.username}`),
      h('div', { class: 'stats' },
        h('div', {}, h('strong', {}, compact(data.friendCount)), h('span', {}, 'Friends')),
        h('div', {}, h('strong', {}, compact(data.posts.length)), h('span', {}, 'Videos')),
        h('div', {}, h('strong', {}, me.settings.showLikeCounts ? compact(data.likeCount) : '—'), h('span', {}, 'Likes'))),
      actions,
      user.bio ? h('p', { class: 'bio' }, user.bio) : null),
    tabs, body));
  showTab('videos');
}

function moreMenu(user) {
  let close;
  close = sheet(`@${user.username}`, h('div', { class: 'menu' },
    h('button', {
      class: 'menu-item danger',
      onclick: async () => {
        close();
        if (!(await confirmDialog(`Report @${user.username}?`, 'Our safety team will review this account. They will also be blocked.', 'Report & block', true))) return;
        await api(`/users/${user.id}/report`, { method: 'POST', body: { reason: 'profile' } });
        toast('Reported and blocked');
        navigate('home');
      },
    }, icon('flag', { size: 20 }), 'Report account'),
    h('button', {
      class: 'menu-item danger',
      onclick: async () => {
        close();
        if (!(await confirmDialog(`Block @${user.username}?`, 'They won’t be able to find you, see your videos or message you.', 'Block', true))) return;
        await api(`/users/${user.id}/block`, { method: 'POST' });
        toast('Blocked');
        navigate('home');
      },
    }, icon('block', { size: 20 }), 'Block')));
}
