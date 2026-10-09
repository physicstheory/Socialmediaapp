import { api, state } from './api.js';
import { h, $, icon, logo, toast } from './ui.js';
import { showAuth } from './views/auth.js';
import { showOnboarding } from './views/onboarding.js';
import { renderFeed } from './views/feed.js';
import { renderFriends } from './views/friends.js';
import { renderCreate } from './views/create.js';
import { renderInbox } from './views/inbox.js';
import { renderChat } from './views/chat.js';
import { renderProfile } from './views/profile.js';
import { renderSettings } from './views/settings.js';

const ROUTES = [
  { re: /^home$/, view: renderFeed, nav: 'home', dark: true },
  { re: /^friends$/, view: renderFriends, nav: 'friends' },
  { re: /^create$/, view: renderCreate, nav: 'create', hideNav: true },
  { re: /^inbox$/, view: renderInbox, nav: 'inbox' },
  { re: /^chat\/([\w-]+)$/, view: renderChat, hideNav: true },
  { re: /^profile$/, view: renderProfile, nav: 'profile' },
  { re: /^u\/([\w.]+)$/, view: renderProfile, nav: 'profile' },
  { re: /^settings$/, view: renderSettings, hideNav: true },
];

let cleanup = null;
let events = null;

export function navigate(path) {
  if (location.hash === `#/${path}`) route();
  else location.hash = `#/${path}`;
}

function buildShell() {
  const app = $('#app');
  app.replaceChildren(
    h('main', { id: 'view' }),
    h('nav', { id: 'tabbar', 'aria-label': 'Main' },
      navBtn('home', 'Home', 'home'),
      navBtn('friends', 'Friends', 'friends'),
      h('a', { href: '#/create', class: 'nav-create', 'aria-label': 'Create' }, h('span', { class: 'create-btn' }, icon('plus', { size: 22 }))),
      navBtn('inbox', 'Inbox', 'inbox', h('span', { class: 'badge', id: 'inbox-badge', hidden: true })),
      navBtn('profile', 'Profile', 'profile')),
  );
  state.subscribe(updateBadges);
}

function navBtn(path, label, iconName, extra) {
  return h('a', { href: `#/${path}`, class: 'nav-item', 'data-nav': path }, h('span', { class: 'nav-icon' }, icon(iconName, { size: 26 }), extra), h('span', {}, label));
}

function updateBadges() {
  const b = $('#inbox-badge');
  if (!b) return;
  const n = state.unread + state.requests;
  b.hidden = n === 0;
  b.textContent = n > 99 ? '99+' : String(n);
}

export async function refreshCounts() {
  try {
    const [chats, reqs] = await Promise.all([api('/chats'), api('/friends/requests')]);
    state.set({ unread: chats.unreadTotal, requests: reqs.incoming.length });
  } catch { /* offline */ }
}

function route() {
  const path = location.hash.replace(/^#\/?/, '') || 'home';
  const match = ROUTES.map((r) => ({ r, m: path.match(r.re) })).find((x) => x.m);
  if (!match) return navigate('home');
  cleanup?.();
  cleanup = null;
  const view = $('#view');
  view.replaceChildren();
  view.className = match.r.dark ? 'dark' : '';
  $('#tabbar').hidden = Boolean(match.r.hideNav);
  $('#tabbar').classList.toggle('on-dark', Boolean(match.r.dark));
  document.querySelectorAll('.nav-item').forEach((a) => a.classList.toggle('active', a.dataset.nav === match.r.nav));
  const result = match.r.view(view, ...match.m.slice(1));
  if (typeof result === 'function') cleanup = result;
  else if (result?.then) result.then((fn) => { if (typeof fn === 'function') cleanup = fn; }).catch((e) => toast(e.message, 'error'));
}

function connectEvents() {
  events?.close();
  events = new EventSource('/api/events');
  events.addEventListener('message', () => { refreshCounts(); document.dispatchEvent(new CustomEvent('ember:message')); });
  events.addEventListener('read', () => document.dispatchEvent(new CustomEvent('ember:read')));
  events.addEventListener('friend_request', (e) => {
    const { from } = JSON.parse(e.data);
    toast(`${from.displayName} sent you a friend request`);
    refreshCounts();
  });
  events.addEventListener('friend_accept', (e) => {
    const { user } = JSON.parse(e.data);
    toast(`You and ${user.displayName} are now friends 🔥`);
  });
}

export function startApp() {
  buildShell();
  window.addEventListener('hashchange', route);
  if (!location.hash || location.hash === '#/' || location.hash === '#') location.hash = '#/home'; // always open on Following
  route();
  connectEvents();
  refreshCounts();
}

export async function signOut() {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  events?.close();
  location.hash = '';
  location.reload();
}

/** Called after sign in / sign up. */
export function afterAuth(user) {
  state.set({ user });
  if (!user.settings.onboarded) {
    showOnboarding(user, (u) => { state.set({ user: u }); location.hash = '#/home'; startApp(); });
  } else {
    location.hash = '#/home';
    startApp();
  }
}

async function boot() {
  const splash = $('#splash');
  const minSplash = new Promise((r) => setTimeout(r, 1600));
  const me = api('/me').then((d) => d.user).catch(() => null);
  const [user] = await Promise.all([me, minSplash]);
  splash.classList.add('hide');
  setTimeout(() => splash.remove(), 500);
  if (!user) {
    $('#app').replaceChildren(h('div', { class: 'auth-backdrop' }, logo(96)));
    showAuth(afterAuth);
  } else {
    afterAuth(user);
  }
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

boot();
