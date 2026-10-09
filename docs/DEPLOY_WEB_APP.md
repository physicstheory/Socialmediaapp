# Turning Ember into a website you can use as a web app

Ember is already a **Progressive Web App (PWA)**: a website that can be installed on a phone or computer. Once installed, it gets its own icon, opens full-screen without browser bars, and loads instantly. To set it up you need to:

1. Run it on your computer to try it out.
2. Put it online on a host that gives you an `https://` address.
3. Install it from that address on your phone.

Total time: about 20 minutes.

---

## Step 1: Run it on your computer

1. Install **Node.js 20 or newer** from <https://nodejs.org> (choose "LTS").
2. Download this project. Use **Code → Download ZIP** on GitHub and unzip it, or `git clone` it.
3. Open a terminal in the project folder and run:

   ```bash
   npm install
   npm run seed     # optional demo data
   npm start
   ```
4. Open **http://localhost:3000**. You'll see the splash screen, then the Sign in / Create account popup.

**Try it on your phone while testing.** Connect the phone to the same Wi-Fi as the computer and open `http://YOUR-COMPUTER-IP:3000`. To find the IP, run `ipconfig` on Windows or `ipconfig getifaddr en0` on Mac. The app works there, but phones only allow "Install app" from an `https://` address, so do Step 2 for the real install.

---

## Step 2: Put it online

Ember is a Node.js server that stores accounts, chats and uploaded videos on disk. Pick a host that runs Node and has **persistent storage**. Without persistent storage, everything resets whenever the server restarts.

### Option A: Render (easiest, no command line)
1. Create a free account on **GitHub** and push this project to a repository. GitHub Desktop is the easiest way if you don't use git.
2. Go to <https://render.com> and sign in with GitHub.
3. Click **New → Blueprint** and pick your repository. Render reads the included `render.yaml`, which sets up:
   - the Node web service
   - `npm ci` / `npm start`
   - a 1 GB persistent disk mounted at `/var/data`
   - `NODE_ENV=production`
4. Click **Apply**. After a couple of minutes you get an address like `https://ember-abcd.onrender.com`. It's HTTPS automatically.
5. *(Optional)* Load the demo accounts: open the service's **Shell** tab and run `npm run seed`.

> 💡 A persistent disk needs Render's paid "Starter" plan (about $7/mo). The free plan works for a demo, but data is wiped on every redeploy or restart. To try it free, delete the `disk:` block and change `plan: starter` to `plan: free` in `render.yaml`.

### Option B: Railway
1. <https://railway.app> → **New Project → Deploy from GitHub repo**.
2. Railway detects Node and runs `npm start`.
3. Add a **Volume** mounted at `/data` and set the variable `DATA_DIR=/data`.
4. **Settings → Networking → Generate Domain** gives you an HTTPS address.

### Option C: Fly.io (uses the included Dockerfile)
```bash
fly launch --no-deploy            # accept the detected Dockerfile, pick a name & region
fly volumes create ember_data --size 1
# add this to fly.toml:
#   [mounts]
#   source = "ember_data"
#   destination = "/data"
fly deploy
```

### Option D: Your own server (VPS) with Docker
```bash
docker build -t ember .
docker run -d --name ember -p 3000:3000 -v ember-data:/data --restart unless-stopped ember
```
Then put **Caddy** in front of it for free automatic HTTPS. Create a `Caddyfile` containing:
```
yourdomain.com {
  reverse_proxy localhost:3000
}
```

### Using your own domain (optional)
Buy a domain from any registrar (Namecheap, Cloudflare, Google/Squarespace…). Then:
1. In your host's dashboard, add it under *Custom Domains*.
2. Create the DNS record the host shows you, usually a `CNAME`.

HTTPS is issued automatically.

### Environment variables
| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Port to listen on (hosts set this for you) |
| `DATA_DIR` | `./data` | Where the database and uploads are stored. Point it at your persistent disk. |
| `NODE_ENV` | — | Set to `production` when deployed |
| `DATABASE_URL` | — | Free Postgres connection string (e.g. Neon) so accounts and chats survive restarts on the free plan |
| `YOUTUBE_API_KEY` | — | Turns on YouTube Shorts in Discover |
| `SUPPORT_EMAIL` | — | Contact email shown on the For Parents page (`/parents`) |
| `ADMIN_USERNAMES` | — | Comma-separated Ember usernames that can add videos to the Discover library in-app |
| `EMBER_HATE_TERMS` | — | Comma-separated extra terms to always block |

---

## Keep accounts saved on Render's free plan (free database)

Render's free plan erases the server's storage whenever the app restarts or wakes up from sleep, which deletes accounts and sign-ins. To fix that, give Ember a free outside database. You can do all of this from your iPhone:

1. Go to **neon.tech** and sign up free (signing in with GitHub works).
2. Create a project with any name, picking the region closest to your Render region.
3. On the project dashboard, tap **Connect** and copy the **connection string**. It starts with `postgresql://` and ends with `sslmode=require`.
4. On Render, open your service, then **Environment → Add Environment Variable**:
   - Key: `DATABASE_URL`
   - Value: paste the connection string
5. Tap **Save Changes**. Render redeploys.

Accounts, friends, chats, settings and your Discover library are now saved permanently. "Keep me signed in" keeps you logged in for a year and renews automatically while you use the app. Uploaded video files and photo Snaps are still stored on Render's disk, so on the free plan those can disappear after a restart. TikTok and YouTube videos aren't affected because they stream from TikTok and YouTube.

---

## Fill Discover with YouTube Shorts (automatic)

Ember can fill Discover with YouTube Shorts on its own, matched to each person's interests, using YouTube's official API with SafeSearch set to strict. It needs a free key:

1. Go to **console.cloud.google.com** and sign in with a Google account.
2. Tap the project picker at the top, then **New Project**. Name it `Ember` and tap **Create**.
3. Open the menu, then **APIs & Services → Library**. Search for **YouTube Data API v3**, open it and tap **Enable**.
4. Go to **APIs & Services → Credentials → Create credentials → API key**, then copy the key.
5. *(Recommended)* Tap the key. Under **API restrictions** choose **Restrict key** and pick **YouTube Data API v3**. Leave **Application restrictions** set to **None**, because "Websites" or "IP addresses" will block Ember's server. Tap **Save**.
6. On Render, go to **Environment** and add `YOUTUBE_API_KEY` = your key, then save and wait for the redeploy.
7. In Ember, open **Settings → YouTube Shorts**. 🟢 means it's working. 🔴 tells you exactly what to fix, with a **Try again** button.

How it works:
- **Fetching:** the first time someone opens Discover, Ember fetches up to 50 Shorts for each of their interests. When they reach the end, it fetches the next 50, so Discover keeps going.
- **Safety:**
  - Every title is checked by Ember's safety filter.
  - Videos YouTube marks **Made for Kids** are rated Everyone. Everything else starts at Teen 13+.
  - Kids accounts only see Discover if a parent turns it on, and then only Everyone-rated videos.
- **Free limits:** the free quota is 10,000 units a day, which is about 90 fetches of 50 videos. Ember stays under that by itself (you can lower its cap with `YOUTUBE_DAILY_UNITS`). Shorts are refreshed or removed after 30 days, as YouTube's terms require.

---

## Filling Discover with TikTok videos

TikTok doesn't let other apps download its For You or trending feed. So Discover is built from a **library of TikTok links** that you choose, plus anything people on Ember post publicly. The videos still stream from TikTok's servers through TikTok's official player.

**Permanent way (works on the Free plan), from your iPhone:**
1. In TikTok, open a video you want (an edit, a movie clip, something trending). Tap **Share → Copy link**.
2. On github.com, open your repo and tap **`discover-library.json`**, then the **✏️ pencil**.
3. Add a line inside `"videos": [ … ]` for each video, with a comma between entries:
   ```json
   { "url": "PASTE-THE-LINK", "category": "movies" },
   ```
   Categories: `comedy, music, dance, sports, gaming, animals, food, education, art, nature, tech, fashion, edits, movies`. You can also add `"rating": "everyone"` for kid-safe videos. The default is Teen 13+.
4. Tap **Commit changes**. Render redeploys, and the videos appear in Discover for everyone whose interests and filters match.

**Quick way (in the app):** on Render, go to **Environment** and add `ADMIN_USERNAMES` = your Ember username. Then **Settings → Discover library (admin)** lets you paste lots of links at once. On the Free plan these vanish when the app restarts, so put your favourites in the file too.

Every video's TikTok caption goes through Ember's safety filter. Anything harmful is skipped.

---

## Step 3: Install it like an app

Open your `https://` address and sign in. Then:

**iPhone / iPad (Safari)**
1. Tap the **Share** button (square with an arrow).
2. Scroll down and tap **Add to Home Screen** → **Add**.
3. Ember now has a flame icon on your home screen and opens full-screen.

**Android (Chrome)**
1. Tap the **⋮** menu, then **Install app** (or **Add to Home screen**).
2. Confirm. Ember appears in your app drawer like any other app.

**Windows / Mac / Chromebook (Chrome or Edge)**
- Click the **install icon** (a monitor with a down-arrow) at the right of the address bar, or go to **⋮ → Cast, save and share → Install page as app**.

Updates are automatic. When you push new code and the host redeploys, the app picks it up the next time it opens.

---

## Before you invite the public

Ember is a working foundation. A public social app for young people has legal and operational responsibilities that code alone doesn't cover:

- **Children's privacy laws.** COPPA (US), GDPR-K / UK Age Appropriate Design Code and similar laws require *verifiable parental consent* before collecting data from under-13s (16 in some EU countries). The parent PIN is a good start but isn't legal consent verification. Talk to a lawyer, or limit sign-ups to 13+ by changing `age < 5` to `age < 13` in `server/routes/account.js`.
- **Privacy policy and terms of service.** These are required by app stores, by TikTok's developer terms and by law.
- **TikTok terms.** Embedding through the official player is allowed. Don't download or re-host TikTok videos, and follow <https://www.tiktok.com/legal/page/global/terms-of-service-for-developers/en>.
- **Human moderation.** Reports are stored in the database (`reports` collection). Build or hire a review process, and know how to report child-safety issues to NCMEC (US) / IWF (UK).
- **Image and video moderation.** The built-in filter reads text only. For uploads and Snaps, add a vision moderation service such as AWS Rekognition, Google Cloud Vision SafeSearch, Hive or Microsoft Content Safety, plus PhotoDNA or another CSAM hash-matching service.
- **Scale.** The JSON-file database is fine for friends and family, roughly hundreds of users. Beyond that, move to Postgres (only `server/db.js` and its callers change) and put uploads on object storage like S3 or Cloudflare R2.
- **Backups.** Back up `DATA_DIR` regularly.
- **Real-time at scale.** Live updates use Server-Sent Events from one server. If you run multiple servers, add Redis pub/sub.
