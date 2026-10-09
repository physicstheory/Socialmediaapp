import { api, state, withPin } from '../api.js';
import { h, icon, avatar, toast, confirmDialog } from '../ui.js';
import { signOut } from '../app.js';
import {
  maturitySection, filtersSection, interestsSection, blockedWordsSection, discoverSection, privacySection, safetyRules, section,
} from './settingsForm.js';

export function renderSettings(view) {
  const user = state.user;
  const draft = structuredClone(user.settings);
  const blocked = h('div', { class: 'list' });

  async function save() {
    try {
      const { user: u } = await withPin((pin) => api('/settings', { method: 'PUT', body: { settings: draft, pin } }));
      state.set({ user: u });
      toast('Settings saved — your feeds are updated');
      history.back();
    } catch (e) { if (!e.cancelled) toast(e.message, 'error'); }
  }

  function pinSection() {
    const cur = h('input', { class: 'input', type: 'password', inputmode: 'numeric', maxlength: '6', placeholder: 'Current PIN' });
    const next = h('input', { class: 'input', type: 'password', inputmode: 'numeric', maxlength: '6', placeholder: 'New 4–6 digit PIN' });
    const call = async (pin) => {
      try {
        const { user: u } = await api('/settings/pin', { method: 'POST', body: { pin, currentPin: cur.value } });
        state.set({ user: u });
        toast(pin === null ? 'PIN removed' : 'PIN saved');
        cur.value = ''; next.value = '';
      } catch (e) { toast(e.message, 'error'); }
    };
    return section(user.ageGroup === 'kid' ? 'Parent PIN' : 'Settings PIN',
      user.hasPin ? 'Settings are locked with a PIN.' : 'Add a PIN so nobody can change these settings without it (great for parents).',
      h('div', { class: 'col gap' },
        user.hasPin ? cur : null, next,
        h('div', { class: 'row gap' },
          h('button', { type: 'button', class: 'btn small', onclick: () => call(next.value) }, user.hasPin ? 'Change PIN' : 'Set PIN'),
          user.hasPin && user.ageGroup !== 'kid' ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => call(null) }, 'Remove PIN') : null)));
  }

  async function loadBlocked() {
    const { items } = await api('/blocks');
    blocked.replaceChildren(...(items.length ? items.map((u) => h('div', { class: 'list-row' }, avatar(u, 36), h('span', { class: 'grow' }, u.displayName),
      h('button', { class: 'btn small ghost', onclick: async () => { await api(`/users/${u.id}/block`, { method: 'DELETE' }); loadBlocked(); } }, 'Unblock')))
      : [h('p', { class: 'small muted' }, 'You haven’t blocked anyone.')]));
  }

  view.append(h('div', { class: 'page settings' },
    h('header', { class: 'page-head' },
      h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => history.back() }, icon('back')),
      h('h1', {}, 'Settings'),
      h('button', { class: 'link-btn accent', onclick: save }, 'Save')),
    user.hasPin ? h('div', { class: 'safety-banner' }, icon('lock', { size: 18 }), h('span', { class: 'small' }, 'These settings are PIN-protected. You’ll be asked for the PIN when you save.')) : null,
    h('p', { class: 'small muted pad' }, `Account mode: ${{ kid: 'Kids', teen: 'Teen', adult: 'Standard' }[user.ageGroup]} · Advanced algorithm settings`),
    interestsSection(draft),
    discoverSection(draft, user),
    maturitySection(draft, user),
    filtersSection(draft, user),
    blockedWordsSection(draft),
    privacySection(draft, user),
    pinSection(),
    safetyRules(user),
    section('Blocked accounts', null, blocked),
    section('Account', null,
      h('p', { class: 'small muted' }, `Signed in as @${user.username}`),
      h('button', { class: 'btn ghost block', onclick: async () => { if (await confirmDialog('Log out?', null, 'Log out')) signOut(); } }, 'Log out')),
    h('div', { class: 'pad' }, h('button', { class: 'btn primary block', onclick: save }, 'Save settings'))));
  loadBlocked().catch(() => {});
}
