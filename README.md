# 🔥 Ember

A friends-first short-video and messaging web app. It looks and scrolls like TikTok, chats work like Snapchat, and safety is built into every layer. The colours are orange and red instead of TikTok's pink and cyan.

- **Opens on Following.** The home screen starts with videos your friends posted. Discover is a second tab, and you can turn it off.
- **Plays TikTok videos.** Paste a TikTok link and the video streams from TikTok's servers inside TikTok's official embed player. You can also upload your own clips.
- **Filtered feed you control.** Every post gets an age rating (Everyone, Teen 13+ or Mature 18+) and topic flags. Your settings decide what you see: maturity level, topic filters, interests, "only my interests", blocked words and a Discover on/off switch.
- **Age-based protections that switch on automatically.** Your birthday puts you in kids, teen or standard mode. Some protections are locked for younger users. Kids accounts need a parent PIN.
- **Snapchat-style messaging.** Chats with friends only, disappearing messages, view-once photo Snaps, save-in-chat, live updates and Snapchat-style status markers (New Snap, New Chat, Delivered, Opened).
- **Safer friend requests.** See [Safety model](#safety-model).
- **Invite TikTok friends.** Make a one-time invite link (with an optional message) on the Friends tab and send it in a TikTok DM. When they open it and join, you're friends on Ember and your message is waiting in their chat. You can also add your TikTok username to your profile so friends your age can search for it.
- **Installable web app (PWA).** Add it to your home screen and it opens full-screen like a native app.

## Quick start

```bash
npm install
npm run seed      # optional: demo accounts and videos
npm start         # → http://localhost:3000
```

The seed creates these demo logins. The password for all of them is `ember-demo-123`.

| Username | Who | What it shows |
|---|---|---|
| `demo` | adult | Following feed with friends' videos, chats, sharing |
| `jordan` | 15-year-old | teen locks, teen-only search |
| `kiddo` | 10-year-old (PIN `1234`) | kids mode, PIN-protected settings and friend adds |
| `nature.daily` | public creator | content that appears in Discover |

Run the tests with `npm test`.

**👉 To put it online and install it on your phone, follow [docs/DEPLOY_WEB_APP.md](docs/DEPLOY_WEB_APP.md).**

## How it works

```
public/            the web app (plain JS modules, no build step)
  index.html       splash screen + app shell
  css/styles.css   TikTok-style UI in orange/red
  js/app.js        boot → splash → sign in/create account popup → onboarding → router
  js/views/        feed, friends, create, inbox, chat, profile, settings, onboarding
  manifest.webmanifest, sw.js, icons/   → makes it an installable web app
server/
  index.js         Express server, security headers, CSRF guard
  moderation.js    text safety engine (flags, ratings, grooming/PII detection)
  policy.js        age groups, default settings, locked settings
  tiktok.js        TikTok oEmbed + embed player integration
  routes/          account, posts/feed, friends, messages (+ live events)
  db.js            JSON-file datastore (swap for Postgres at scale)
```

### The feed algorithm
- **Following:** posts from your friends, newest first, still run through your safety filters.
- **Discover:** public posts that pass every filter, ranked by:
  - whether the topic matches your interests (+4)
  - likes (logarithmic)
  - freshness
  - topics you liked (boosted) or marked "Not interested" (lowered)
- **Filters applied to every post:** its rating must be at or below your maturity level, it can't carry any flag you switched on, and it can't contain your blocked words. Posts you hid, posts from blocked accounts and posts with 3 or more reports are left out.

### Safety model
| Area | What Ember does |
|---|---|
| Content | Captions, hashtags and TikTok titles are scanned. Common tricks like `k.y.s`, `v4pe` and `dr*gs` are normalized first. Dangerous challenges, self-harm promotion, explicit sexual content, bullying and hate are blocked when someone posts or comments. Everything else gets a rating and topic flags. |
| Discovery | Adults can't find, view or friend under-18s. Teens can only search for other teens. Kids can't search at all. |
| Friend requests | Each person chooses who can send them requests: anyone their age, friends of friends, or friend code only. A minor can add an adult (such as a parent) only with that adult's friend code. Kids need a parent PIN to add or accept friends. The request screen shows mutual friends and warns about new accounts. You can send 25 requests a day, and there's a 7-day wait after a decline. |
| Messaging | Friends only. When a minor is in the chat, messages asking for secrets, photos, addresses, ages or meetups are blocked and logged. Under-18s can't send phone numbers, emails, addresses or links. Profanity is masked for anyone who filters it. |
| Snaps | Viewable once. Photos are re-encoded on your device, which removes GPS/EXIF data. Snaps can be reported, and reported ones are kept as evidence. Photo Snaps are off by default for kids. |
| Accounts | Report and block are on every post, profile and message. Accounts reported 3 or more times can't send friend requests. |
| Security | scrypt password hashing, HttpOnly SameSite session cookies, CSRF header + origin check, strict Content-Security-Policy, rate limits, magic-byte checks on uploads, and no `innerHTML` with user content. |

### About TikTok videos
TikTok has no public API that lets another app load someone's For You or Following feed. Ember uses TikTok's official, public tools instead:
- **oEmbed**, for the caption, author and thumbnail.
- **Embed Player v1**, to stream the video from TikTok's servers with related videos turned off (`rel=0`).

Friends share TikTok links into Ember, and Ember builds your feed from those. Later you could add TikTok's Login Kit / Display API so people can import their own TikTok videos. That needs a TikTok developer app and their approval.
