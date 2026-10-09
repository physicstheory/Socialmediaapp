import { api, state, withPin } from '../api.js';
import { h, icon, avatar, toast, confirmDialog } from '../ui.js';
import { signOut } from '../app.js';
import {
  maturitySection, filtersSection, interestsSection, blockedWordsSection, discoverSection, privacySection, safetyRules, section, INTERESTS,
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

  function librarySection() {
    const urls = h('textarea', { class: 'input', rows: '5', placeholder: 'Paste TikTok links, one per line' });
    const cat = h('select', { class: 'input' }, h('option', { value: '' }, 'Auto-detect topic'),
      Object.entries(INTERESTS).map(([k, v]) => h('option', { value: k }, v)));
    const rating = h('select', { class: 'input' }, h('option', { value: 'everyone' }, 'Everyone'), h('option', { value: 'teen', selected: true }, 'Teen 13+'), h('option', { value: 'mature' }, 'Mature 18+'));
    const btn = h('button', {
      type: 'button', class: 'btn primary',
      onclick: async () => {
        btn.disabled = true; btn.textContent = 'Adding…';
        try {
          const r = await api('/admin/library', { method: 'POST', body: { urls: urls.value, category: cat.value, rating: rating.value } });
          toast(`Added ${r.added} · ${r.duplicates} already there${r.failed.length ? ` · ${r.failed.length} failed` : ''}`);
          urls.value = r.failed.map((f) => f.split(' — ')[0]).join('\n');
        } catch (e) { toast(e.message, 'error'); } finally { btn.disabled = false; btn.textContent = 'Add to Discover'; }
      },
    }, 'Add to Discover');
    return section('Discover library (admin)', 'Add TikTok videos everyone can see in Discover. On the free Render plan, links added here vanish on restart — put permanent ones in discover-library.json on GitHub.',
      urls, h('div', { class: 'row gap' }, cat, rating), btn);
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
    user.isAdmin ? librarySection() : null,
    section('Blocked accounts', null, blocked),
    section('Account', null,
      h('p', { class: 'small muted' }, `Signed in as @${user.username}`),
      h('button', { class: 'btn ghost block', onclick: async () => { if (await confirmDialog('Log out?', null, 'Log out')) signOut(); } }, 'Log out')),
    h('div', { class: 'pad' }, h('button', { class: 'btn primary block', onclick: save }, 'Save settings'))));
  loadBlocked().catch(() => {});
}
