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
| `EMBER_HATE_TERMS` | — | Comma-separated extra terms to always block |

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
