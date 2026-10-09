// Age-based safety policy: default settings and which settings are locked for each age group.
import { CATEGORIES, FILTER_KEYS, RATINGS } from './moderation.js';

export function ageFromBirthdate(birthdate, now = new Date()) {
  const b = new Date(`${birthdate}T00:00:00Z`);
  if (Number.isNaN(b.getTime())) return null;
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

export function ageGroupFor(age) {
  if (age < 13) return 'kid';
  if (age < 18) return 'teen';
  return 'adult';
}

export function userAge(user) {
  return ageFromBirthdate(user.birthdate);
}

export function userAgeGroup(user) {
  return ageGroupFor(userAge(user));
}

export function defaultSettings(age) {
  const group = ageGroupFor(age);
  const allOn = Object.fromEntries(FILTER_KEYS.map((k) => [k, true]));
  if (group === 'kid') {
    return {
      maxRating: 'everyone', filters: allOn, interests: [], onlyInterests: true, blockedWords: [],
      discoverEnabled: false, privateAccount: true, friendRequests: 'code', photoSnaps: false,
      showLikeCounts: false, onboarded: false,
    };
  }
  if (group === 'teen') {
    return {
      maxRating: 'teen', filters: { ...allOn, profanity: age < 16, violence: true, scary: age < 16 },
      interests: [], onlyInterests: false, blockedWords: [], discoverEnabled: true,
      privateAccount: true, friendRequests: 'mutuals', photoSnaps: true, showLikeCounts: true, onboarded: false,
    };
  }
  return {
    maxRating: 'teen', filters: { ...allOn, profanity: false, scary: false, violence: false },
    interests: [], onlyInterests: false, blockedWords: [], discoverEnabled: true,
    privateAccount: false, friendRequests: 'everyone', photoSnaps: true, showLikeCounts: true, onboarded: false,
  };
}

/**
 * Locks: hard locks can never be changed for this age group.
 * pinLocked: (kids) can only be changed with the parent PIN.
 */
export function locksFor(age) {
  const group = ageGroupFor(age);
  if (group === 'kid') {
    return {
      hard: { maxRating: 'everyone', filters: Object.fromEntries(FILTER_KEYS.map((k) => [k, true])), privateAccount: true, friendRequests: 'code' },
      maxRatingCeiling: 'everyone',
      requiresPin: true,
    };
  }
  if (group === 'teen') {
    const hard = { filters: { mature: true, dangerous: true, sensitive: true, substances: true } };
    if (age < 16) hard.privateAccount = true;
    return { hard, maxRatingCeiling: 'teen', requiresPin: false };
  }
  return { hard: {}, maxRatingCeiling: 'mature', requiresPin: false };
}

const FRIEND_REQ = ['everyone', 'mutuals', 'code'];

/** Merge user-submitted settings over current ones, validating and enforcing locks. */
export function sanitizeSettings(current, incoming, age) {
  const s = structuredClone(current);
  const inc = incoming || {};
  if (RATINGS.includes(inc.maxRating)) s.maxRating = inc.maxRating;
  if (inc.filters && typeof inc.filters === 'object') {
    for (const k of FILTER_KEYS) if (typeof inc.filters[k] === 'boolean') s.filters[k] = inc.filters[k];
  }
  if (Array.isArray(inc.interests)) s.interests = inc.interests.filter((c) => CATEGORIES[c]).slice(0, 20);
  if (Array.isArray(inc.blockedWords)) {
    s.blockedWords = [...new Set(inc.blockedWords.map((w) => String(w).trim().toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, 100);
  }
  for (const k of ['onlyInterests', 'discoverEnabled', 'privateAccount', 'photoSnaps', 'showLikeCounts', 'onboarded']) {
    if (typeof inc[k] === 'boolean') s[k] = inc[k];
  }
  if (FRIEND_REQ.includes(inc.friendRequests)) s.friendRequests = inc.friendRequests;
  return enforceLocks(s, age);
}

export function enforceLocks(settings, age) {
  const s = settings;
  const locks = locksFor(age);
  if (RATINGS.indexOf(s.maxRating) > RATINGS.indexOf(locks.maxRatingCeiling)) s.maxRating = locks.maxRatingCeiling;
  for (const [k, v] of Object.entries(locks.hard)) {
    if (k === 'filters') Object.assign(s.filters, v);
    else s[k] = v;
  }
  return s;
}

export function publicLocks(age) {
  const l = locksFor(age);
  return {
    maxRatingCeiling: l.maxRatingCeiling,
    lockedFilters: Object.keys(l.hard.filters || {}),
    privateAccount: 'privateAccount' in l.hard,
    friendRequests: 'friendRequests' in l.hard,
    requiresPin: l.requiresPin,
  };
}
