// Shared "advanced algorithm settings" controls used by onboarding and the Settings page.
import { h, icon, toggle } from '../ui.js';

export const INTERESTS = {
  comedy: '😂 Comedy', music: '🎵 Music', dance: '💃 Dance', sports: '⚽ Sports', gaming: '🎮 Gaming',
  animals: '🐶 Animals', food: '🍕 Food', education: '🧠 Learning', art: '🎨 Art & DIY', nature: '🌲 Nature & Travel',
  tech: '🤖 Tech', fashion: '👟 Style', edits: '✂️ Edits', movies: '🎬 Movie & TV clips',
};

export const FILTERS = [
  { key: 'profanity', label: 'Bad language', desc: 'Hide videos with swearing and blur it in comments & chats.' },
  { key: 'violence', label: 'Violence & fighting', desc: 'Fights, weapons, blood.' },
  { key: 'scary', label: 'Scary content', desc: 'Horror, jump scares, creepy stuff.' },
  { key: 'mature', label: 'Sexual / suggestive', desc: 'Suggestive dances, thirst traps, adult themes.' },
  { key: 'substances', label: 'Drugs, alcohol & vaping', desc: 'Partying, smoking, vaping.' },
  { key: 'dangerous', label: 'Dangerous challenges', desc: 'Stunts and viral challenges that can hurt people.' },
  { key: 'sensitive', label: 'Self-harm & eating disorders', desc: 'Hides triggering topics; harmful content is always removed.' },
];

const RATINGS = [
  { key: 'everyone', label: 'Everyone', desc: 'Only content suitable for all ages.' },
  { key: 'teen', label: 'Teen 13+', desc: 'Mild language, mild scary or action content.' },
  { key: 'mature', label: 'Mature 18+', desc: 'Adult topics (never explicit — that is always blocked).' },
];
const ORDER = ['everyone', 'teen', 'mature'];

const lockNote = (text) => h('span', { class: 'lock-note' }, icon('lock', { size: 14 }), text);

export function section(title, desc, ...children) {
  return h('section', { class: 'set-section' }, h('h3', {}, title), desc ? h('p', { class: 'muted small' }, desc) : null, children);
}

export function rowSwitch(label, desc, value, onChange, locked) {
  return h('div', { class: 'set-row' },
    h('div', { class: 'set-text' }, h('strong', {}, label), desc ? h('span', { class: 'muted small' }, desc) : null, locked ? lockNote(locked) : null),
    toggle(value, onChange, { disabled: Boolean(locked), label }));
}

export function maturitySection(draft, user) {
  const ceiling = ORDER.indexOf(user.locks.maxRatingCeiling);
  const wrap = h('div', { class: 'radio-cards' });
  const draw = () => wrap.replaceChildren(...RATINGS.map((r, i) => {
    const disabled = i > ceiling;
    return h('button', {
      type: 'button', class: `radio-card ${draft.maxRating === r.key ? 'selected' : ''} ${disabled ? 'disabled' : ''}`,
      disabled, onclick: () => { draft.maxRating = r.key; draw(); },
    }, h('strong', {}, r.label, disabled ? icon('lock', { size: 14 }) : null), h('span', { class: 'small muted' }, r.desc));
  }));
  draw();
  return section('Content maturity', 'The most mature content Ember is allowed to show you.', wrap,
    ceiling < 2 ? lockNote(user.ageGroup === 'kid' ? 'Kids accounts are locked to Everyone.' : 'Mature content unlocks at 18.') : null);
}

export function filtersSection(draft, user) {
  return section('Hide these automatically', 'Ember scans captions, hashtags and TikTok titles and filters out anything you switch on.',
    FILTERS.map((f) => rowSwitch(f.label, f.desc, draft.filters[f.key], (v) => { draft.filters[f.key] = v; },
      user.locks.lockedFilters.includes(f.key) ? 'Always on for your age' : null)));
}

export function interestsSection(draft, { showOnly = true } = {}) {
  const chips = h('div', { class: 'chips' });
  const draw = () => chips.replaceChildren(...Object.entries(INTERESTS).map(([k, label]) => h('button', {
    type: 'button', class: `chip ${draft.interests.includes(k) ? 'on' : ''}`,
    onclick: () => {
      draft.interests = draft.interests.includes(k) ? draft.interests.filter((x) => x !== k) : [...draft.interests, k];
      draw();
    },
  }, label)));
  draw();
  return section('Your interests', 'Pick what you want to see. Discover is built from these.', chips,
    showOnly ? rowSwitch('Only show my interests', 'Discover will show nothing outside the topics above.', draft.onlyInterests, (v) => { draft.onlyInterests = v; }) : null);
}

export function blockedWordsSection(draft) {
  const list = h('div', { class: 'chips' });
  const input = h('input', { class: 'input', placeholder: 'Add a word or #hashtag to never see', maxlength: '40' });
  const draw = () => list.replaceChildren(...draft.blockedWords.map((w) => h('button', {
    type: 'button', class: 'chip on removable', 'aria-label': `Remove ${w}`,
    onclick: () => { draft.blockedWords = draft.blockedWords.filter((x) => x !== w); draw(); },
  }, w, icon('close', { size: 12 }))));
  const add = () => {
    const w = input.value.trim().toLowerCase().replace(/^#/, '');
    if (w && !draft.blockedWords.includes(w)) draft.blockedWords = [...draft.blockedWords, w];
    input.value = '';
    draw();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  draw();
  return section('Blocked words & topics', 'Videos mentioning these never show up for you.',
    h('div', { class: 'row gap' }, input, h('button', { type: 'button', class: 'btn small', onclick: add }, 'Add')), list);
}

export function discoverSection(draft, user) {
  return section('Feeds', 'Ember always opens on Following — videos from your friends.',
    rowSwitch('Discover tab', 'Show filtered public videos from people you don’t know, based on your interests.', draft.discoverEnabled,
      (v) => { draft.discoverEnabled = v; }, user.ageGroup === 'kid' ? null : null),
    user.ageGroup === 'kid' ? lockNote('A parent PIN is needed to change settings on kids accounts.') : null);
}

export function privacySection(draft, user) {
  const seg = h('div', { class: 'segmented' });
  const opts = [['everyone', 'Anyone my age'], ['mutuals', 'Friends of friends'], ['code', 'Friend code only']];
  const locked = user.locks.friendRequests;
  const draw = () => seg.replaceChildren(...opts.map(([k, label]) => h('button', {
    type: 'button', class: draft.friendRequests === k ? 'on' : '', disabled: locked,
    onclick: () => { draft.friendRequests = k; draw(); },
  }, label)));
  draw();
  return section('Privacy & safety', null,
    rowSwitch('Private account', 'Only friends can see your videos.', draft.privateAccount, (v) => { draft.privateAccount = v; },
      user.locks.privateAccount ? 'Always private for your age' : null),
    h('div', { class: 'set-row col-row' },
      h('div', { class: 'set-text' }, h('strong', {}, 'Who can send me friend requests'),
        locked ? lockNote('Kids accounts use friend codes only') : null),
      seg),
    rowSwitch('Photo Snaps', 'Send & receive disappearing photos with friends.', draft.photoSnaps, (v) => { draft.photoSnaps = v; }),
    rowSwitch('Show like counts', 'Turn off to hide numbers and focus on the fun.', draft.showLikeCounts, (v) => { draft.showLikeCounts = v; }));
}

export function safetyRules(user) {
  const rules = [
    'Messages are friends-only — strangers can never DM you.',
    'Adults can’t find, follow or message under-18s.',
    'Messages asking for secrets, photos, addresses or meetups are blocked when a young person is in the chat.',
    'Photos you send are re-saved without location data.',
    'Harmful content (dangerous challenges, self-harm promotion, explicit content, bullying) is always blocked.',
  ];
  if (user.ageGroup !== 'adult') rules.splice(3, 0, 'Links and phone numbers are hidden in your chats.');
  return section('Always-on protections', null, h('ul', { class: 'rules' }, rules.map((r) => h('li', {}, icon('shield', { size: 16 }), r))));
}
