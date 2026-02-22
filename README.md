# 🤖 GitBot V3 — Discord GitHub Bot

A self-hosted Discord bot that forwards GitHub events to your Discord server as rich embeds. Supports **multiple repositories**, per-repo webhook secrets, automatic channel creation, and a guided DM setup flow for repo owners.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen) ![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2) ![License](https://img.shields.io/badge/license-MIT-blue)

---

## ✨ Features

- 📦 **Push / commits** — branch, commit list with links and authors
- 🔀 **Pull requests** — open, merge, close, review requested
- 🐛 **Issues** — opened, closed, commented, reopened
- 🚀 **Releases** — new release published
- ⭐ **Stars & forks** — community activity
- ✅ **GitHub Actions** — workflow pass/fail notifications
- 🗄️ **Multi-repo** — monitor unlimited repositories, each with its own channel and secret
- 🔒 **Per-repo webhook secrets** — auto-generated HMAC-SHA256 secret per repository
- 📬 **Guided DM setup** — admin tags a repo owner; they receive step-by-step instructions via DM with a confirm button
- 🏓 **Ping verification** — GitHub's first ping posts a live confirmation embed in the repo's channel
- 🔇 **Event muting** — silence any event type for 15 min–24 h without disabling it
- 📋 **Live digest** — scrollable feed of recent events with outcomes
- 🔄 **Interactive embeds** — refresh, dismiss, undo, and confirm flows throughout

---

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- A Discord server where you have admin permissions
- [ngrok](https://ngrok.com/) (for local development) or a public server

---

## ⚡ Setup Guide

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/discord-github-bot.git
cd discord-github-bot
npm install
```

### 2. Create your Discord bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application** → give it a name
3. Go to **Bot** → click **Add Bot**
4. Under **Token** → click **Reset Token** and copy it
5. Enable **Server Members Intent** and **Message Content Intent**

### 3. Invite the bot to your server

1. Go to **OAuth2 → URL Generator**
2. Check **Scopes:** `bot`
3. Check **Permissions:** `Send Messages`, `Embed Links`, `View Channels`, `Manage Channels`
4. Copy the generated URL and open it in your browser

> `Manage Channels` is needed so the bot can auto-create a channel per repository.

### 4. Get your Server ID

1. In Discord go to **Settings → Advanced** and enable **Developer Mode**
2. Right-click your server icon → **Copy Server ID**

### 5. Configure environment variables

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Discord Developer Portal → Your App → Bot → Token |
| `DISCORD_GUILD_ID` | Right-click your server → Copy Server ID |
| `WEBHOOK_PORT` | Port for the Express server (default `3000`) |
| `WEBHOOK_BASE_URL` | Your public URL — ngrok or permanent domain (see below) |
| `GITHUB_WEBHOOK_SECRET` | Legacy single-webhook secret (optional, V2 compat) |

### 6. Start ngrok (local development)

```bash
ngrok http 3000
```

Copy the `https://xxxx.ngrok-free.app` URL and set it in your `.env`:

```
WEBHOOK_BASE_URL=https://xxxx.ngrok-free.app
```

> **Tip:** The free ngrok plan gives you a new URL on every restart. Get a [free static domain](https://dashboard.ngrok.com/domains) so your URL never changes:
> ```bash
> ngrok http --domain=your-static-domain.ngrok-free.app 3000
> ```

### 7. Start the bot

```bash
npm start
```

You should see:
```
✅ GitBot V3 logged in as YourBot#1234
🌐 Webhook server on port 3000
🔗 Webhook base URL: https://xxxx.ngrok-free.app
```

### 8. Add your first repository

In Discord, run:

```
/repo add repository:owner/repo user:@RepoOwner
```

- The bot creates a `#github-owner-repo` channel automatically
- **You** (admin) get a server reply with the Payload URL and Secret
- **The repo owner** gets a DM with numbered setup steps and a **"I've added the webhook"** button

### 9. Repo owner sets up the webhook on GitHub

The DM walks them through:

1. Go to the repo → **Settings → Webhooks → Add webhook**
2. Paste the **Payload URL** (e.g. `https://xxxx.ngrok-free.app/webhook/1`)
3. Set **Content type** to `application/json`
4. Paste the **Secret**
5. Choose events and click **Add webhook**
6. Click **"I've added the webhook"** in the DM

When GitHub saves the webhook it sends a **ping** — the bot immediately posts a `🏓 GitHub Ping Received` embed in the repo's channel to confirm the connection is live. When the user clicks the button:

- The channel gets a `✅ Webhook Connected` confirmation embed
- You (admin) receive a DM: *"[username] has added the webhook for owner/repo"*
- The setup DM is automatically deleted

---

## 🛠️ Commands

### Repository management

| Command | Description |
|---|---|
| `/repo add repository:owner/repo [channel:#name] [user:@user]` | Add a repo to monitor. Creates a channel, generates a secret, and optionally DMs setup instructions to the repo owner. |
| `/repo remove repository:owner/repo` | Permanently remove a repository |
| `/repo list [detailed:true]` | List all monitored repositories |
| `/repo info repository:owner/repo` | Show full details with Enable/Disable and Delete buttons |
| `/repo enable repository:owner/repo enable:true\|false` | Toggle a repository on or off |

### Admin

| Command | Description |
|---|---|
| `/admin add user:@user` | Grant admin access to a user |
| `/admin remove user:@user` | Revoke admin access |
| `/admin list` | List all admins |

> Any Discord user with the **Administrator** permission is automatically treated as an admin.

### Status and monitoring

| Command | Description |
|---|---|
| `/ping` | Latency check with colour-coded bars |
| `/status` | Uptime, WS ping, event counters, active mutes |
| `/events` | Bar chart breakdown of event types since startup |
| `/digest [count:5–25]` | Scrollable feed of recent GitHub events |
| `/test [channel:#name]` | Send a test embed to verify bot permissions |

### Muting

| Command | Description |
|---|---|
| `/mute event:push [reason:...]` | Silence an event type — duration picker: 15 min / 1 h / 6 h / 24 h |
| `/watchlist` | View active mutes with one-click Unmute buttons |

### Other

| Command | Description |
|---|---|
| `/clear-stats` | Reset all event counters (with confirmation) |
| `/help` | Browse full documentation with category dropdown |

### Context menus (right-click a message → Apps)

| Menu item | Description |
|---|---|
| 📌 Pin to GitHub log | Reposts the message to `#github-log` with an Acknowledged button |
| 🔁 Resend this embed | Re-sends a GitBot embed to any configured channel |

---

## 📦 Supported Events

| GitHub Event | What triggers it |
|---|---|
| `push` | Commits pushed to any branch |
| `pull_request` | PR opened, merged, closed, review requested |
| `issues` | Issue opened, closed, reopened |
| `issue_comment` | New comment on an issue |
| `pull_request_review` | PR review submitted |
| `create` | Branch or tag created |
| `delete` | Branch or tag deleted |
| `release` | Release published |
| `star` | Repo starred or unstarred |
| `fork` | Repo forked |
| `workflow_run` | GitHub Actions workflow completed |
| `check_run` | CI check failed or anomalous (successes are silent) |
| `deployment_status` | Deployment status updated |
| `ping` | GitHub connectivity test — posts confirmation in repo channel |

---

## 🚀 Deployment

### Railway (easiest)
1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add your environment variables in the **Variables** tab — set `WEBHOOK_BASE_URL` to the auto-generated Railway URL
4. Use that same URL when running `/repo add`

### Render (free tier)
1. Push to GitHub → [render.com](https://render.com) → New Web Service → connect repo
2. Add environment variables including `WEBHOOK_BASE_URL`

> Render's free tier spins down after inactivity (~30 s wake time on first webhook).

### VPS (DigitalOcean, Hetzner, etc.)
```bash
git clone https://github.com/YOUR_USERNAME/discord-github-bot.git
cd discord-github-bot
npm install
cp .env.example .env && nano .env   # fill in all values including WEBHOOK_BASE_URL

npm install -g pm2
pm2 start index.js --name gitbot
pm2 save && pm2 startup
```

---

## 📁 File Structure

```
discord-github-bot/
├── index.js           # Entry point: Discord client, slash commands, button handlers
├── multiWebhook.js    # Express webhook router — per-repo routing + ping handler
├── repoCommands.js    # /repo and /admin slash commands + DM setup flow
├── embeds.js          # GitHub event → Discord embed formatters
├── database.js        # SQLite store (repositories, admins, tokens)
├── poller.js          # GitHub API polling for repos without webhooks
├── digest.js          # In-memory ring buffer of recent events
├── mutes.js           # In-memory event mute store
├── help.js            # /help command with category dropdown + pagination
├── config.json        # Legacy channel routing (V2 compat, hot-reloaded)
├── .env               # Your secrets — never commit this!
├── .env.example       # Template
├── .gitignore
└── package.json
```

---

## 🏥 Health Check

```
GET http://localhost:3000/health
```

Returns bot status, version, repo count, active mutes, and event stats.

---

## 🤝 Contributing

Pull requests are welcome! To add support for a new GitHub event:

1. Add a `formatEventName(payload)` function in `embeds.js`
2. Add a `case` for it in the `buildEmbed()` switch in `embeds.js`
3. Add it to `EVENT_CHOICES` in `index.js` so it appears in `/mute`
4. Add it to the supported events table in this README

---

## 📄 License

MIT — do whatever you want with it.