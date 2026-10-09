# Getting Ember on the App Store (and Google Play)

Ember is a web app today. Stores only accept real app packages, so the plan is to **wrap the web app in a native "shell"** using [Capacitor](https://capacitorjs.com) (free, made by Ionic). The shell is a real iOS/Android app that loads Ember and adds native features. Your Render server stays exactly as it is.

| | App Store (iPhone) | Google Play (Android) |
|---|---|---|
| Developer account | **$99 / year** (Apple Developer Program) | **$25 once** |
| Need a Mac? | Yes for Xcode, *or* a cloud build service (see below) | No |
| Review time | Usually 1–3 days, often a couple of rounds | Hours to days, plus a 14-day test period for new personal accounts |
| Difficulty | Harder | Easier, so start here |

> **Under 18?** Both Apple and Google require the account holder to be an adult. A parent or guardian enrolls, and you build and manage the app under their account.

---

## Step 0: Get these ready first (both stores ask for them)
- [ ] **Your app on a paid Render plan.** A free server that sleeps takes about 30 seconds to wake, and reviewers will reject an app that looks broken.
- [ ] **`DATABASE_URL` set** (see DEPLOY_WEB_APP.md) so accounts don't vanish mid-review.
- [ ] **Privacy policy page:** what you collect (username, birthday, messages, videos), why, how long you keep it, and how to delete it. Both stores require a public URL. Free generators exist, but have it reviewed if you'll have under-18 users.
- [ ] **`SUPPORT_EMAIL` set.** It shows on `/parents`, and stores require a support contact.
- [ ] **A demo account for reviewers.** For example, the seeded `demo` / `ember-demo-123` account with friends and videos already set up.
- [ ] **A minimum-age decision.** If anyone under 13 can sign up, you're subject to COPPA (US) and the stores' children's rules. The simplest route is to **set the minimum age to 13** for the store version (change `age < 5` to `age < 13` in `server/routes/account.js`).

Already built into Ember (Apple checks for these):
- ✅ **In-app account deletion:** Settings → Account → Delete account (Apple guideline 5.1.1(v)).
- ✅ **User-generated content safety:** filtering, report buttons, blocking and a way to contact you (guideline 1.2).
- ✅ **No third-party sign-in,** so "Sign in with Apple" isn't required.
- ✅ **Official TikTok and YouTube embeds,** not copied videos (guideline 5.2, intellectual property).

---

## Step 1: Wrap Ember with Capacitor
On a computer with Node.js installed (Windows, Mac or Linux), from the project folder:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init Ember com.yourname.ember --web-dir public
```

Edit the generated `capacitor.config.json` so the app loads your live server (that keeps sign-in cookies, chats and updates working with no extra code):

```json
{
  "appId": "com.yourname.ember",
  "appName": "Ember",
  "webDir": "public",
  "server": { "url": "https://YOUR-APP.onrender.com", "cleartext": false },
  "ios": { "contentInset": "never" }
}
```

Then:
```bash
npx cap add ios
npx cap add android
```

### Avoid the most common rejection: "it's just a website" (Apple guideline 4.2)
Apple rejects apps that are only a website in a frame. Add a few native features before you submit:
- **Push notifications** for new messages and friend requests (`@capacitor/push-notifications`). This is the biggest win, and it's also what users expect from a messaging app.
- **The native share sheet** for Send and invite links (`@capacitor/share`).
- **The native camera** for photo Snaps (`@capacitor/camera`).
- **Haptics** on likes and sends (`@capacitor/haptics`).
- **An offline screen** that's friendlier than a blank page.

---

## Step 2: Build and submit to the App Store

**With a Mac:**
1. `npx cap open ios`, which opens Xcode.
2. Set your **Team** (your Apple Developer account), **Bundle ID** and **app icon** (use `public/icons/icon-512.png`, resized to 1024×1024 with no transparency).
3. Choose **Product → Archive**, then **Distribute App → App Store Connect**.

**Without a Mac:** use a cloud build service, which builds the iOS app on its Macs from your GitHub repo:
- **Codemagic** (codemagic.io) has a free tier and supports Capacitor. Connect your repo, add your Apple Developer credentials, and it uploads to App Store Connect.
- Ionic Appflow and MacinCloud (a rented Mac) also work.

**In App Store Connect** (appstoreconnect.apple.com):
1. **My Apps → +** to create the app. Name it **Ember**, or a variation if that name is taken.
2. **Category:** Social Networking. **Don't choose the Kids category.** It bans third-party content like TikTok and YouTube embeds and has stricter rules.
3. **Age rating questionnaire:** answer honestly. User-generated content, messaging and unrestricted video mean Ember will be rated around **13+**.
4. **App Privacy:** declare that you collect contact info (username), identifiers, user content (messages, photos, videos) and date of birth. Say none of it is used for tracking.
5. **Screenshots:** 6.7" and 6.5" iPhone sizes. Take them from the Following feed, chat, the parent PIN and the filters screens.
6. **Review notes:** include the demo login and a sentence like *"Ember is a friends-first video app with age-based protections; videos come from users and official TikTok/YouTube embeds."*
7. **Submit for Review.** If it's rejected, Apple tells you which guideline. Fix it and resubmit.

Before submitting, invite friends to test through **TestFlight** (also in App Store Connect).

---

## Step 3: Google Play (easier, so do it first)
The fastest route needs no Capacitor at all:
1. Go to **pwabuilder.com**, enter your Render URL, and choose **Package for stores → Android**. It creates a ready-made Play Store package from your existing web app. It also gives you an `assetlinks.json` file. Upload that file to Ember's `public/.well-known/` folder so Android trusts the app.
2. Create a **Google Play Console** account ($25).
3. Create the app, then upload the `.aab` file to **Testing → Closed testing**.
4. **New personal accounts must run a closed test with at least 12 testers for 14 days** before going public. Friends and family count.
5. Fill in the content rating, data safety form and privacy policy URL, then promote to **Production**.

(You can also use the Capacitor `android` project from Step 1: `npx cap open android`, then build a signed bundle in Android Studio.)

---

## Realistic timeline
| Week | What |
|---|---|
| 1 | Privacy policy, paid Render plan + database, minimum-age decision, developer accounts |
| 2 | Google Play via PWABuilder → start the 14-day closed test |
| 2–4 | Capacitor + push notifications + share/camera → TestFlight with friends |
| 4–5 | Submit to the App Store; expect 1–2 rounds of review feedback |
| 4–5 | Google Play goes live after the 14-day test |
