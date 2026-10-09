import { api } from '../api.js';
import { h, $, icon, logo, toast } from '../ui.js';
import {
  interestsSection, maturitySection, filtersSection, blockedWordsSection, discoverSection, privacySection, safetyRules, section,
} from './settingsForm.js';

const MODE = {
  kid: { title: 'Kids mode', text: 'The strictest protections are on and locked. A parent sets a PIN to manage settings and approve friends.' },
  teen: { title: 'Teen mode', text: 'Extra protections are on. Mature content and adult contact are blocked automatically.' },
  adult: { title: 'Standard mode', text: 'You’re in control. You can still filter your feed as much as you want.' },
};

export function showOnboarding(user, onDone) {
  const draft = structuredClone(user.settings);
  let pinSet = user.hasPin;
  let step = 0;
  const root = h('div', { class: 'onboarding' });
  $('#app').replaceChildren(root);

  const pinBox = () => {
    const pin = h('input', { class: 'input', type: 'password', inputmode: 'numeric', maxlength: '6', placeholder: '4–6 digit PIN' });
    const pin2 = h('input', { class: 'input', type: 'password', inputmode: 'numeric', maxlength: '6', placeholder: 'Confirm PIN' });
    const status = h('p', { class: 'small muted' }, pinSet ? '✅ PIN is set.' : '');
    const save = h('button', {
      type: 'button', class: 'btn small',
      onclick: async () => {
        if (pin.value !== pin2.value) return toast('PINs don’t match', 'error');
        try {
          await api('/settings/pin', { method: 'POST', body: { pin: pin.value } });
          pinSet = true;
          status.textContent = '✅ PIN is set. Keep it somewhere safe.';
          pin.value = ''; pin2.value = '';
        } catch (e) { toast(e.message, 'error'); }
      },
    }, 'Set PIN');
    return section(user.ageGroup === 'kid' ? 'Parent PIN (required)' : 'Settings PIN (optional)',
      user.ageGroup === 'kid'
        ? 'A parent or guardian should choose this. It’s needed to change settings and to add friends.'
        : 'Lock these settings so they can’t be changed without the PIN.',
      h('div', { class: 'col gap' }, pin, pin2, save, status));
  };

  const steps = [
    () => [
      h('div', { class: 'center col gap' }, logo(64), h('h2', {}, `Hi ${user.displayName}! 👋`),
        h('p', { class: 'muted' }, 'Let’s set up your advanced feed settings. You can change these anytime in Settings.')),
      h('div', { class: 'mode-card' }, icon('shield', { size: 28 }), h('div', {}, h('strong', {}, MODE[user.ageGroup].title), h('p', { class: 'small' }, MODE[user.ageGroup].text))),
      safetyRules(user),
    ],
    () => [interestsSection(draft)],
    () => [maturitySection(draft, user), filtersSection(draft, user)],
    () => [discoverSection(draft, user), blockedWordsSection(draft)],
    () => [privacySection(draft, user), pinBox()],
  ];

  async function next() {
    if (step === 1 && draft.interests.length === 0) return toast('Pick at least one interest', 'error');
    if (step < steps.length - 1) { step++; draw(); return; }
    if (user.ageGroup === 'kid' && !pinSet) return toast('A parent needs to set a PIN to finish.', 'error');
    try {
      const { user: u } = await api('/settings', { method: 'PUT', body: { settings: { ...draft, onboarded: true } } });
      toast('You’re all set! 🔥');
      onDone(u);
    } catch (e) { toast(e.message, 'error'); }
  }

  function draw() {
    root.replaceChildren(
      h('header', { class: 'onb-head' },
        step > 0 ? h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => { step--; draw(); } }, icon('back')) : h('span', { class: 'icon-btn' }),
        h('div', { class: 'dots' }, steps.map((_, i) => h('span', { class: i <= step ? 'on' : '' }))),
        h('span', { class: 'icon-btn' })),
      h('div', { class: 'onb-body' }, steps[step]()),
      h('footer', { class: 'onb-foot' }, h('button', { class: 'btn primary block', onclick: next }, step === steps.length - 1 ? 'Finish setup' : 'Continue')),
    );
    root.querySelector('.onb-body').scrollTop = 0;
  }
  draw();
}
