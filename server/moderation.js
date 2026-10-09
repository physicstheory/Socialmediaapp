// Automatic content safety for Ember.
//
// Every post, comment and message runs through these checks. Text is normalized first so
// common evasions ("k.y.s", "dr*gs", "s3xy", "v4pe") still match. Matches produce
// *flags* (used to filter what each viewer sees) and *severe* hits (blocked outright).
//
// Note: this analyzes text (captions, hashtags, TikTok titles, messages). It cannot "see"
// pixels. For production you should add an image/video moderation service — see
// docs/DEPLOY_WEB_APP.md ("Going further").

export const FILTER_KEYS = ['profanity', 'violence', 'scary', 'mature', 'substances', 'dangerous', 'sensitive'];

export const CATEGORIES = {
  comedy: ['funny', 'comedy', 'lol', 'meme', 'memes', 'prank', 'skit', 'joke', 'jokes', 'humor'],
  music: ['music', 'song', 'singing', 'cover', 'guitar', 'piano', 'drums', 'rap', 'band', 'concert'],
  dance: ['dance', 'dancing', 'choreo', 'choreography', 'dancechallenge'],
  sports: ['sports', 'soccer', 'football', 'basketball', 'baseball', 'hockey', 'skate', 'skateboarding', 'gym', 'workout', 'nba', 'nfl', 'tennis', 'swim'],
  gaming: ['gaming', 'gamer', 'minecraft', 'fortnite', 'roblox', 'videogames', 'nintendo', 'xbox', 'playstation', 'speedrun'],
  animals: ['animals', 'dog', 'dogs', 'puppy', 'cat', 'cats', 'kitten', 'pet', 'pets', 'bird', 'horse', 'wildlife'],
  food: ['food', 'recipe', 'cooking', 'baking', 'foodie', 'snack', 'dessert', 'cake', 'pizza'],
  education: ['learn', 'learning', 'education', 'science', 'history', 'math', 'facts', 'fact', 'study', 'school', 'space', 'physics', 'howto'],
  art: ['art', 'drawing', 'painting', 'diy', 'craft', 'crafts', 'sketch', 'design', 'animation'],
  nature: ['nature', 'outdoors', 'travel', 'hiking', 'ocean', 'beach', 'mountains', 'flowers', 'garden', 'camping'],
  tech: ['tech', 'coding', 'programming', 'robot', 'robots', 'gadgets', 'ai', 'computer', 'engineering'],
  fashion: ['fashion', 'outfit', 'ootd', 'style', 'makeup', 'beauty', 'hair', 'nails'],
};

const LEXICON = {
  profanity: ['fuck', 'fucking', 'fucker', 'shit', 'shitty', 'bitch', 'bastard', 'asshole', 'dick', 'piss', 'crap', 'damn', 'wtf', 'stfu', 'motherfucker', 'bullshit', 'dumbass'],
  violence: ['fight', 'fights', 'fighting', 'gore', 'gory', 'blood', 'bloody', 'kill', 'killing', 'murder', 'shooting', 'gun', 'guns', 'knife', 'weapon', 'weapons', 'beat up', 'brawl', 'stab', 'stabbing', 'knockout', 'street fight'],
  scary: ['horror', 'jumpscare', 'jump scare', 'creepy', 'scary', 'haunted', 'ghost', 'demon', 'possessed', 'nightmare', 'creepypasta', 'paranormal'],
  mature: ['sexy', 'nsfw', '18+', 'thirst trap', 'thirsttrap', 'twerk', 'twerking', 'lingerie', 'hookup', 'onlyfans', 'nude', 'nudes', 'porn', 'xxx', 'sex', 'horny', 'spicy content'],
  substances: ['vape', 'vaping', 'weed', '420', 'alcohol', 'drunk', 'beer', 'vodka', 'tequila', 'whiskey', 'edible', 'edibles', 'cocaine', 'drugs', 'smoking', 'cigarette', 'juul', 'wine', 'stoned', 'high af', 'pills'],
  dangerous: ['blackout challenge', 'choking challenge', 'pass out challenge', 'tide pod', 'skull breaker', 'benadryl challenge', 'fire challenge', 'outlet challenge', 'penny challenge', 'car surfing', 'subway surfing', 'dangerous stunt', 'dont try this', 'do not try this', 'nyquil chicken', 'chroming'],
  sensitive: ['self harm', 'selfharm', 'suicide', 'suicidal', 'cutting', 'pro ana', 'proana', 'thinspo', 'starving myself', 'eating disorder', 'sh tw', 'unalive'],
  bullying: ['kys', 'kill yourself', 'nobody likes you', 'you are ugly', 'ur ugly', 'youre ugly', 'go die', 'fat pig', 'everyone hates you', 'you should die', 'loser'],
  // Extend with slurs/hate terms appropriate to your community (kept out of source on purpose).
  hate: (process.env.EMBER_HATE_TERMS || '').split(',').map((s) => s.trim()).filter(Boolean),
};

// Hits that are never allowed anywhere on Ember (blocked at post/comment/message time).
const SEVERE = {
  mature: ['nude', 'nudes', 'porn', 'xxx', 'onlyfans'],
  dangerous: LEXICON.dangerous.filter((t) => !['dont try this', 'do not try this'].includes(t)),
  sensitive: ['pro ana', 'proana', 'thinspo', 'kill yourself'],
  bullying: LEXICON.bullying.filter((t) => t !== 'loser'),
  hate: LEXICON.hate,
};

// Things adults should never ask minors. Messages to/from under-18 accounts that match
// are blocked and logged for review.
const GROOMING = [
  'dont tell your parents', 'dont tell your mom', 'dont tell your dad', 'dont tell anyone',
  'our little secret', 'our secret', 'keep this secret', 'keep it a secret', 'how old are you',
  'send pics', 'send a pic', 'send me a pic', 'send me pics', 'send a photo of yourself',
  'whats your address', 'where do you live', 'are you home alone', 'are your parents home',
  'meet up', 'meet me', 'come over', 'delete this chat', 'delete our chat', 'add me on',
  'what school do you go to', 'what school', 'you are mature for your age', 'mature for your age',
];

const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i', '€': 'e' };

export function normalize(text = '') {
  let t = String(text).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  t = t.replace(/[’']/g, '');
  // keep "18+" and "420" intact before leet substitution
  const keepers = [];
  t = t.replace(/18\+|420/g, (m) => { keepers.push(m); return ` zzk${String.fromCharCode(96 + keepers.length)}zz `; });
  t = t.replace(/[013457@$!€]/g, (c) => LEET[c] || c);
  t = t.replace(/\*/g, '');
  t = t.replace(/[^a-z0-9_+#\s]/g, ' ').replace(/#/g, ' ');
  let tokens = t.split(/\s+/).filter(Boolean);
  // merge runs of single letters: "k y s" -> "kys"
  const merged = [];
  let run = '';
  for (const tok of tokens) {
    if (tok.length === 1) { run += tok; continue; }
    if (run) { merged.push(run); run = ''; }
    merged.push(tok);
  }
  if (run) merged.push(run);
  tokens = merged.map((tok) => tok.replace(/^zzk([a-z])zz$/, (_, c) => keepers[c.charCodeAt(0) - 97]));
  // collapse 3+ repeated letters: "fuuuuck" -> "fuck"
  return ` ${tokens.map((x) => x.replace(/(.)\1{2,}/g, '$1')).join(' ')} `;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

const patternCache = new Map();
function hasTerm(normalized, term) {
  let re = patternCache.get(term);
  if (!re) {
    const n = normalize(term).trim();
    re = new RegExp(` ${escapeRe(n)}(?:s|es)? `);
    patternCache.set(term, re);
  }
  return re.test(normalized);
}

export function containsAny(text, terms) {
  const n = normalize(text);
  return terms.some((t) => hasTerm(n, t));
}

export function analyzeText(text) {
  const n = normalize(text);
  const flags = new Set();
  const severe = [];
  for (const [flag, terms] of Object.entries(LEXICON)) {
    for (const term of terms) {
      if (hasTerm(n, term)) {
        flags.add(flag);
        if (SEVERE[flag]?.includes(term)) severe.push(flag);
      }
    }
  }
  return { flags: [...flags], severe: [...new Set(severe)] };
}

export const RATINGS = ['everyone', 'teen', 'mature'];

export function rateFlags(flags, selfLabel = 'everyone') {
  let rating = 'everyone';
  const f = new Set(flags);
  if (f.has('profanity') || f.has('scary') || f.has('violence') || f.has('dangerous') || f.has('sensitive') || f.has('bullying')) rating = 'teen';
  if (f.has('mature') || f.has('substances')) rating = 'mature';
  if (RATINGS.indexOf(selfLabel) > RATINGS.indexOf(rating)) rating = selfLabel;
  return rating;
}

export function categorize(text, chosen) {
  if (chosen && CATEGORIES[chosen]) return chosen;
  const n = normalize(text);
  let best = 'other';
  let bestScore = 0;
  for (const [cat, words] of Object.entries(CATEGORIES)) {
    const score = words.filter((w) => hasTerm(n, w)).length;
    if (score > bestScore) { best = cat; bestScore = score; }
  }
  return best;
}

const SEVERE_REASONS = {
  mature: 'sexual content',
  dangerous: 'a dangerous challenge or stunt',
  sensitive: 'content promoting self-harm or eating disorders',
  bullying: 'bullying or harassment',
  hate: 'hateful language',
};

export function severeReason(severe) {
  return `This looks like it contains ${severe.map((s) => SEVERE_REASONS[s] || s).join(' and ')}, which isn't allowed on Ember.`;
}

const PROFANITY_RE = new RegExp(`\\b(${LEXICON.profanity.map(escapeRe).join('|')})\\b`, 'gi');
export function maskProfanity(text) {
  return String(text).replace(PROFANITY_RE, (w) => w[0] + '*'.repeat(w.length - 1));
}

const URL_RE = /\b((?:https?:\/\/|www\.)[^\s]+|[a-z0-9-]+\.(?:com|net|org|io|gg|co|me|ly|app|xyz|tv)(?:\/[^\s]*)?)/gi;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/g;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const ADDRESS_RE = /\b\d{1,5}\s+(?:[a-z]+\s){0,3}(?:street|st|avenue|ave|road|rd|lane|ln|drive|dr|boulevard|blvd|court|ct|way|place|pl)\b/gi;

/**
 * Checks a chat message. Returns { ok, text, notices[], blockedReason?, flagged }.
 * sender/recipient: { ageGroup }
 */
export function checkMessage(text, sender, recipient) {
  const notices = [];
  let out = String(text || '').slice(0, 1000);
  const { flags, severe } = analyzeText(out);
  const minorInvolved = sender.ageGroup !== 'adult' || recipient.ageGroup !== 'adult';

  if (severe.length) {
    return { ok: false, blockedReason: severeReason(severe), flagged: true };
  }
  if (minorInvolved && containsAny(out, GROOMING)) {
    return {
      ok: false,
      flagged: true,
      blockedReason: "This message wasn't sent. Ember blocks messages that ask for secrets, photos, meetups or personal details when a young person is in the chat.",
    };
  }
  if (sender.ageGroup !== 'adult') {
    const before = out;
    out = out.replace(EMAIL_RE, '[email hidden]').replace(ADDRESS_RE, '[address hidden]').replace(PHONE_RE, '[number hidden]');
    if (out !== before) notices.push('We hid personal info (phone, email or address) to keep you safe.');
  }
  if (minorInvolved) {
    const before = out;
    out = out.replace(URL_RE, '[link removed]');
    if (out !== before) notices.push('Links are turned off in chats with younger users.');
  }
  return { ok: true, text: out, notices, flags, flagged: false };
}
