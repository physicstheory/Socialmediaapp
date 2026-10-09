// Invite links shared through TikTok DMs (or anywhere): #/invite/<token>
import { api, withPin } from '../api.js';
import { h, avatar, toast, confirmDialog } from '../ui.js';

const KEY = 'ember:pendingInvite';

export function inviteTokenFromHash() {
  const m = location.hash.match(/^#\/invite\/([\w-]{8,40})$/);
  return m ? m[1] : null;
}

export function rememberInvite(token) {
  try { localStorage.setItem(KEY, token); } catch { /* private mode */ }
}

function takeInvite() {
  try {
    const t = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    return t;
  } catch { return null; }
}

export async function inviteInfo(token) {
  try { return await api(`/invites/${token}`); } catch { return null; }
}

/** Banner shown on the welcome popup for people arriving from an invite link. */
export function inviteBanner(info) {
  return h('div', { class: 'invite-banner' }, avatar(info.from, 40),
    h('span', { class: 'small' }, h('strong', {}, info.from.displayName), ' invited you to Ember. Create an account and you’ll be friends', info.hasNote ? ' — they left you a message!' : '.'));
}

/** After sign in / onboarding: offer to accept a remembered invite. */
export async function handlePendingInvite(navigate) {
  const token = takeInvite();
  if (!token) return;
  const info = await inviteInfo(token);
  if (!info) { toast('That invite link has expired or was already used.', 'error'); return; }
  const ok = await confirmDialog(`Add ${info.from.displayName} as a friend?`,
    `@${info.from.username} sent you an Ember invite. Only accept people you know in real life.`, 'Add friend');
  if (!ok) return;
  try {
    const { user } = await withPin((pin) => api(`/invites/${token}/accept`, { method: 'POST', body: { pin } }), 'A parent needs to enter the PIN to add this friend.');
    toast(`You and ${user.displayName} are friends now 🔥`);
    navigate(`chat/${user.id}`);
  } catch (e) { if (!e.cancelled) toast(e.message, 'error'); }
}
