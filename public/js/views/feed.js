import { api, state } from '../api.js';
import { h, icon, avatar, toast, sheet, compact, timeAgo, emptyState, confirmDialog } from '../ui.js';
import { INTERESTS } from './settingsForm.js';

let muted = true; // browsers only allow autoplay when muted; first tap on the sound icon turns sound on

const tiktokSrc = (id) => `https://www.tiktok.com/player/v1/${id}?${new URLSearchParams({
  autoplay: '1', loop: '1', music_info: '1', description: '0', rel: '0', native_context_menu: '0',
  closed_caption: '1', progress_bar: '1', play_button: '1', volume_control: '1', fullscreen_button: '0', timestamp: '0',
})}`;

const REPORT_REASONS = ['Bullying or harassment', 'Dangerous or harmful', 'Sexual content', 'Violence', 'Hate', 'Self-harm', 'Spam or scam', 'Something else'];

/** Vertical, snap-scrolling video list. Returns { el, add(posts), destroy() }. */
export function videoList({ onNearEnd, emptyEl } = {}) {
  const scroller = h('div', { class: 'feed' });
  const posts = [];
  let active = null;

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting && e.intersectionRatio > 0.6) setActive(e.target);
    }
  }, { root: scroller, threshold: [0.6] });

  function setActive(slide) {
    if (active === slide) return;
    if (active) deactivate(active);
    active = slide;
    activate(slide);
    const idx = [...scroller.children].indexOf(slide);
    if (onNearEnd && idx >= scroller.children.length - 3) onNearEnd();
  }

  function activate(slide) {
    const v = slide.querySelector('video');
    if (v) { v.muted = muted; v.play().catch(() => {}); }
    const frame = slide.querySelector('iframe');
    if (frame && !frame.src) frame.src = frame.dataset.src;
  }

  function deactivate(slide) {
    const v = slide.querySelector('video');
    if (v) v.pause();
    const frame = slide.querySelector('iframe');
    if (frame) frame.removeAttribute('src'); // unloading the TikTok player stops playback
  }

  function remove(slide) {
    if (active === slide) active = null;
    io.unobserve(slide);
    slide.remove();
    if (!scroller.children.length && emptyEl) scroller.append(emptyEl);
  }

  function add(items) {
    if (posts.length === 0 && items.length === 0 && emptyEl) { scroller.replaceChildren(emptyEl); return; }
    for (const p of items) {
      posts.push(p);
      const s = slide(p, { remove });
      scroller.append(s);
      io.observe(s);
    }
  }

  function destroy() {
    io.disconnect();
    if (active) deactivate(active);
  }

  return { el: scroller, add, destroy, scrollTo: (i) => scroller.children[i]?.scrollIntoView() };
}

function slide(post, ctx) {
  const el = h('article', { class: 'slide', 'data-id': post.id });
  let media;
  if (post.source === 'tiktok') {
    media = h('div', { class: 'media tiktok', style: post.thumbnailUrl ? { backgroundImage: `url("${encodeURI(post.thumbnailUrl)}")` } : {} },
      h('iframe', {
        'data-src': tiktokSrc(post.videoId), title: 'TikTok video', allow: 'autoplay; encrypted-media; picture-in-picture',
        referrerpolicy: 'strict-origin-when-cross-origin', loading: 'lazy',
      }));
  } else {
    const video = h('video', { src: post.videoUrl, playsinline: true, loop: true, preload: 'metadata', muted: true });
    const pauseIcon = h('div', { class: 'pause-icon' }, icon('play', { size: 64 }));
    let lastTap = 0;
    const tap = h('div', {
      class: 'tap-layer',
      onclick: (e) => {
        const now = Date.now();
        if (now - lastTap < 300) { heartBurst(el, e); if (!post.liked) like(); lastTap = 0; return; }
        lastTap = now;
        setTimeout(() => {
          if (lastTap !== now) return;
          if (video.paused) { video.play().catch(() => {}); pauseIcon.classList.remove('show'); } else { video.pause(); pauseIcon.classList.add('show'); }
        }, 260);
      },
    });
    const soundBtn = h('button', {
      class: 'sound-btn', 'aria-label': 'Toggle sound',
      onclick: () => {
        muted = !muted;
        video.muted = muted;
        soundBtn.replaceChildren(icon(muted ? 'mute' : 'sound', { size: 20 }));
      },
    }, icon(muted ? 'mute' : 'sound', { size: 20 }));
    media = h('div', { class: 'media' }, video, tap, pauseIcon, soundBtn);
  }

  const likeBtn = h('button', { class: `rail-btn ${post.liked ? 'liked' : ''}`, 'aria-label': 'Like', onclick: () => like() });
  const saveBtn = h('button', { class: `rail-btn ${post.saved ? 'saved' : ''}`, 'aria-label': 'Save', onclick: () => toggleSave() });
  const commentBtn = h('button', { class: 'rail-btn', 'aria-label': 'Comments', onclick: () => openComments(post, updateCounts) });
  const showCounts = state.user?.settings.showLikeCounts !== false;

  function updateCounts() {
    likeBtn.className = `rail-btn ${post.liked ? 'liked' : ''}`;
    likeBtn.replaceChildren(icon('heart', { size: 34 }), h('span', {}, showCounts ? compact(post.likes) : ''));
    saveBtn.className = `rail-btn ${post.saved ? 'saved' : ''}`;
    saveBtn.replaceChildren(icon('bookmark', { size: 30 }), h('span', {}, 'Save'));
    commentBtn.replaceChildren(icon('comment', { size: 32 }), h('span', {}, compact(post.comments)));
  }
  async function like() {
    try { Object.assign(post, (await api(`/posts/${post.id}/like`, { method: 'POST' })).post); updateCounts(); } catch (e) { toast(e.message, 'error'); }
  }
  async function toggleSave() {
    try {
      Object.assign(post, (await api(`/posts/${post.id}/save`, { method: 'POST' })).post);
      updateCounts();
      toast(post.saved ? 'Saved to your profile' : 'Removed from saved');
    } catch (e) { toast(e.message, 'error'); }
  }
  updateCounts();

  const canAdd = post.canAdd;
  const avatarBtn = h('div', { class: 'rail-avatar' },
    h('a', { href: `#/u/${post.author.username}`, 'aria-label': `${post.author.displayName}'s profile` }, avatar(post.author, 48)),
    canAdd ? h('button', {
      class: 'add-badge', 'aria-label': 'Add friend',
      onclick: async (e) => {
        const btn = e.currentTarget;
        try {
          await api('/friends/request', { method: 'POST', body: { username: post.author.username } });
          toast('Friend request sent');
          btn.remove();
        } catch (err) { toast(err.message, 'error'); }
      },
    }, icon('plus', { size: 14 })) : null);

  const rail = h('div', { class: 'rail' },
    avatarBtn, likeBtn, commentBtn, saveBtn,
    h('button', { class: 'rail-btn', 'aria-label': 'Send to a friend', onclick: () => openShare(post) }, icon('share', { size: 30 }), h('span', {}, 'Send')),
    h('button', { class: 'rail-btn', 'aria-label': 'More', onclick: () => openMore(post, () => ctx.remove(el)) }, icon('more', { size: 30 })));

  const meta = h('div', { class: 'meta' },
    h('a', { class: 'meta-user', href: `#/u/${post.author.username}` }, `@${post.author.username}`, h('span', { class: 'meta-time' }, ` · ${timeAgo(post.createdAt)}`)),
    post.caption ? h('p', { class: 'caption' }, post.caption) : null,
    h('div', { class: 'meta-tags' },
      INTERESTS[post.category] ? h('span', { class: 'tag' }, INTERESTS[post.category]) : null,
      post.rating !== 'everyone' ? h('span', { class: 'tag rating' }, post.rating === 'teen' ? '13+' : '18+') : null),
    post.source === 'tiktok' ? h('p', { class: 'music' }, icon('music', { size: 14 }), ` via TikTok${post.tiktokAuthor ? ` · ${post.tiktokAuthor}` : ''}`) : null);

  el.append(media, rail, meta);
  return el;
}

function heartBurst(el, e) {
  const r = el.getBoundingClientRect();
  const heart = h('div', { class: 'burst', style: { left: `${e.clientX - r.left - 40}px`, top: `${e.clientY - r.top - 40}px` } }, icon('heart', { size: 80 }));
  el.append(heart);
  setTimeout(() => heart.remove(), 800);
}

export async function openComments(post, onChange) {
  const list = h('div', { class: 'comment-list' }, h('p', { class: 'muted center' }, 'Loading…'));
  const input = h('input', { class: 'input', placeholder: 'Add a kind comment…', maxlength: '300' });
  const form = h('form', {
    class: 'comment-form',
    onsubmit: async (e) => {
      e.preventDefault();
      if (!input.value.trim()) return;
      try {
        const { comment } = await api(`/posts/${post.id}/comments`, { method: 'POST', body: { text: input.value } });
        input.value = '';
        if (list.querySelector('.muted')) list.replaceChildren();
        list.append(commentRow(comment));
        post.comments++;
        title();
        onChange?.();
      } catch (err) { toast(err.message, 'error'); }
    },
  }, input, h('button', { class: 'icon-btn accent', 'aria-label': 'Post comment' }, icon('send')));
  const commentRow = (c) => h('div', { class: 'comment' }, avatar(c.author, 32),
    h('div', {}, h('strong', { class: 'small' }, c.author.displayName), h('p', {}, c.text), h('span', { class: 'tiny muted' }, timeAgo(c.createdAt))));
  sheet(`${compact(post.comments)} comments`, [list, form], { tall: true });
  const title = () => { const t = list.closest('.sheet')?.querySelector('.sheet-head span'); if (t) t.textContent = `${compact(post.comments)} comments`; };
  try {
    const { items, canComment } = await api(`/posts/${post.id}/comments`);
    post.comments = items.length;
    title();
    list.replaceChildren(...(items.length ? items.map(commentRow) : [h('p', { class: 'muted center' }, 'No comments yet. Say something nice!')]));
    if (!canComment) form.replaceChildren(h('p', { class: 'small muted center' }, icon('lock', { size: 14 }), ' Only friends can comment on this video.'));
  } catch (e) { list.replaceChildren(h('p', { class: 'muted center' }, e.message)); }
}

export async function openShare(post) {
  const body = h('div', { class: 'share-list' }, h('p', { class: 'muted center' }, 'Loading friends…'));
  const close = sheet('Send to friends', body);
  try {
    const { items } = await api('/friends');
    if (!items.length) { body.replaceChildren(h('p', { class: 'muted center' }, 'Add friends to send them videos.')); return; }
    body.replaceChildren(...items.map((f) => h('button', {
      class: 'share-friend',
      onclick: async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          await api(`/chats/${f.id}`, { method: 'POST', body: { postId: post.id } });
          btn.classList.add('sent');
          toast(`Sent to ${f.displayName}`);
        } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
      },
    }, avatar(f, 52), h('span', { class: 'small' }, f.displayName))));
  } catch (e) { close(); toast(e.message, 'error'); }
}

function openMore(post, removeSlide) {
  let close;
  const item = (ic, label, fn, cls = '') => h('button', { class: `menu-item ${cls}`, onclick: () => { close(); fn(); } }, icon(ic, { size: 22 }), label);
  close = sheet('Options', h('div', { class: 'menu' },
    !post.mine ? item('eyeoff', 'Not interested', async () => {
      await api(`/posts/${post.id}/not-interested`, { method: 'POST' }).catch(() => {});
      removeSlide();
      toast('Got it — you’ll see less like this');
    }) : null,
    !post.mine ? item('flag', 'Report video', () => reportPost(post, removeSlide), 'danger') : null,
    post.tiktokUrl ? h('a', { class: 'menu-item', href: post.tiktokUrl, target: '_blank', rel: 'noopener noreferrer' }, icon('link', { size: 22 }), 'Open in TikTok') : null,
    post.mine ? item('close', 'Delete video', async () => {
      if (!(await confirmDialog('Delete this video?', 'This can’t be undone.', 'Delete', true))) return;
      await api(`/posts/${post.id}`, { method: 'DELETE' });
      removeSlide();
      toast('Deleted');
    }, 'danger') : null));
}

function reportPost(post, removeSlide) {
  let close;
  close = sheet('Why are you reporting this?', h('div', { class: 'menu' }, REPORT_REASONS.map((r) => h('button', {
    class: 'menu-item',
    onclick: async () => {
      close();
      await api(`/posts/${post.id}/report`, { method: 'POST', body: { reason: r } }).catch(() => {});
      removeSlide();
      toast('Thanks for reporting. We’ve hidden this video for you.');
    },
  }, r))));
}

/** Full-screen viewer for a list of posts (used from profiles and chats). */
export function openPostViewer(posts, start = 0) {
  const list = videoList();
  const wrap = h('div', { class: 'viewer dark' },
    h('button', { class: 'viewer-back icon-btn', 'aria-label': 'Close', onclick: () => { list.destroy(); wrap.remove(); } }, icon('back', { size: 28 })),
    list.el);
  document.getElementById('overlay-root').append(wrap);
  list.add(posts);
  requestAnimationFrame(() => list.scrollTo(start));
}

export function renderFeed(view) {
  let tab = 'following';
  let list = null;
  let nextOffset = 0;
  let loading = false;
  const tabs = {};
  const body = h('div', { class: 'feed-body' });

  const header = h('header', { class: 'feed-top' },
    h('span', { class: 'feed-top-side' }),
    h('div', { class: 'feed-tabs', role: 'tablist' },
      (tabs.following = h('button', { role: 'tab', onclick: () => switchTab('following') }, 'Following')),
      (tabs.discover = h('button', { role: 'tab', onclick: () => switchTab('discover') }, 'Discover'))),
    h('a', { class: 'feed-top-side icon-btn', href: '#/friends', 'aria-label': 'Find friends' }, icon('search', { size: 26 })));

  async function load() {
    if (loading || nextOffset === null) return;
    loading = true;
    const forTab = tab;
    try {
      const data = await api('/feed', { query: { tab, offset: nextOffset } });
      if (forTab !== tab) return;
      if (data.disabled) {
        list.el.replaceChildren(emptyState('eyeoff', 'Discover is off', 'You (or a parent) turned off Discover. Your Following feed is right next door.',
          h('button', { class: 'btn primary', onclick: () => switchTab('following') }, 'Go to Following'),
          h('a', { class: 'btn ghost', href: '#/settings' }, 'Settings')));
        nextOffset = null;
        return;
      }
      nextOffset = data.nextOffset;
      list.add(data.items);
    } catch (e) {
      toast(e.message, 'error');
    } finally { loading = false; }
  }

  function switchTab(t) {
    tab = t;
    tabs.following.classList.toggle('active', t === 'following');
    tabs.discover.classList.toggle('active', t === 'discover');
    tabs.following.setAttribute('aria-selected', String(t === 'following'));
    tabs.discover.setAttribute('aria-selected', String(t === 'discover'));
    list?.destroy();
    nextOffset = 0;
    const emptyEl = t === 'following'
      ? emptyState('friends', 'Your Following feed is quiet', 'Videos your friends post show up here first. Add some friends to get started!',
        h('a', { class: 'btn primary', href: '#/friends' }, 'Find friends'),
        h('button', { class: 'btn ghost light', onclick: () => switchTab('discover') }, 'Explore Discover'))
      : emptyState('search', 'Nothing here yet', 'No videos match your interests and filters right now. Try adding more interests in Settings.',
        h('a', { class: 'btn primary', href: '#/settings' }, 'Edit settings'));
    list = videoList({ onNearEnd: load, emptyEl });
    body.replaceChildren(list.el);
    load();
  }

  view.append(header, body);
  switchTab('following'); // Ember always opens on your friends
  const onVis = () => { if (document.hidden) list?.el.querySelectorAll('video').forEach((v) => v.pause()); };
  document.addEventListener('visibilitychange', onVis);
  return () => { list?.destroy(); document.removeEventListener('visibilitychange', onVis); };
}
