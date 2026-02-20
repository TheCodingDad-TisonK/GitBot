# 🤖 Discord GitHub Bot

A self-hosted Discord bot that forwards GitHub events to your Discord server as rich embeds. Fully configurable — map any GitHub event type to any channel you want.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen) ![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2) ![License](https://img.shields.io/badge/license-MIT-blue)

---

## ✨ Features

- 📦 **Push / commits** — shows branch, commit list with links and authors
- 🔀 **Pull requests** — open, merge, close, review requested
- 🐛 **Issues** — opened, closed, commented, reopened
- 🚀 **Releases** — new release published
- ⭐ **Stars & forks** — community activity
- ✅ **GitHub Actions** — workflow pass/fail notifications
- 🎛️ **Per-event channel routing** — send each event type to a different channel
- 🔄 **Hot-reload config** — change channel routing without restarting the bot
- 🔒 **Webhook signature verification** — optional secret to secure your endpoint

---

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- A Discord server where you have admin permissions
- A GitHub repo you want to track

---

## ⚡ Setup Guide

### 1. Clone the repo
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
5. Scroll down and enable **Server Members Intent** and **Message Content Intent**

### 3. Invite the bot to your server

1. In the Developer Portal go to **OAuth2 → URL Generator**
2. Check **Scopes:** `bot`
3. Check **Permissions:** `Send Messages`, `Embed Links`, `View Channels`
4. Copy the generated URL, open it in your browser, and invite the bot

### 4. Get your Server ID

1. In Discord go to **Settings → Advanced** and enable **Developer Mode**
2. Right-click your server icon → **Copy Server ID**

### 5. Configure environment variables

Copy the example file and fill in your values:
```bash
cp .env.example .env
```

| Variable | Where to get it |
|---|---|
| `DISCORD_TOKEN` | Discord Developer Portal → Your App → Bot → Token |
| `DISCORD_GUILD_ID` | Right-click your server → Copy Server ID |
| `WEBHOOK_PORT` | Any open port, default `3000` |
| `GITHUB_WEBHOOK_SECRET` | Make up any random string — paste the same into GitHub webhook settings |

### 6. Create Discord channels

Create text channels in your server matching the names in `config.json`. The defaults are:

| Channel | Receives |
|---|---|
| `#github-releases` | Releases |
| `#github-commits` | Pushes, PRs, branches, CI |
| `#github-issues` | Issues, comments, stars, forks |

> 💡 You can use any channel names — just update `config.json` to match.

### 7. Run the bot
```bash
npm start
```

You should see:
```
✅ Discord bot logged in as YourBot#1234
📡 Webhook server listening on port 3000
```

### 8. Expose your bot to GitHub

GitHub needs a public URL to send events to. Use [ngrok](https://ngrok.com/) for local development:

1. Download ngrok from [ngrok.com/download](https://ngrok.com/download)
2. Sign up for a free account and add your authtoken:
   ```bash
   ngrok config add-authtoken YOUR_TOKEN
   ```
3. Run it:
   ```bash
   ngrok http 3000
   ```
4. Copy the `https://xxxx.ngrok-free.app` URL

> For permanent hosting see the [Deployment](#-deployment) section below.

### 9. Add the webhook to GitHub

Go to your GitHub repo → **Settings → Webhooks → Add webhook**:

- **Payload URL:** `https://xxxx.ngrok-free.app/webhook`
- **Content type:** `application/json`
- **Secret:** same value as `GITHUB_WEBHOOK_SECRET` in your `.env`
- **Events:** Select "Let me select individual events" and check what you want

Click **Add webhook**. GitHub sends a ping — a green checkmark means you're all set!

---

## 🎛️ Configuring Channel Routing

Edit `config.json` to control which events go to which channel. The bot **hot-reloads** this file on every event — no restart needed.

```json
{
  "channels": {
    "push":                "github-commits",
    "pull_request":        "github-commits",
    "issues":              "github-issues",
    "issue_comment":       "github-issues",
    "pull_request_review": "github-commits",
    "create":              "github-commits",
    "delete":              "github-commits",
    "release":             "github-releases",
    "star":                "github-issues",
    "fork":                "github-issues",
    "workflow_run":        "github-commits",
    "check_run":           "github-commits",
    "deployment":          "github-commits",
    "deployment_status":   "github-commits"
  }
}
```

- Change a value to route that event to a different channel
- Set to `null` to disable that event type entirely
- Channel names must exactly match your Discord channel names (no `#`)

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
| `check_run` | Individual check completed |
| `deployment` | Deployment created |
| `deployment_status` | Deployment status updated |

---

## 🚀 Deployment

For permanent hosting so you don't need to keep your PC on:

### Railway (easiest, free tier available)
1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add your environment variables in the **Variables** tab
4. Use the auto-generated Railway URL as your GitHub webhook URL

### Render (free tier available)
1. Push to GitHub
2. Go to [render.com](https://render.com) → New Web Service → connect your repo
3. Add environment variables in the dashboard
4. Use the provided URL as your webhook URL

> **Note:** Render's free tier spins down after inactivity but wakes up when GitHub sends a webhook (~30 second delay).

### VPS (DigitalOcean, Hetzner, etc.)
```bash
git clone https://github.com/YOUR_USERNAME/discord-github-bot.git
cd discord-github-bot
npm install
cp .env.example .env && nano .env

npm install -g pm2
pm2 start index.js --name discord-github-bot
pm2 save && pm2 startup
```

---

## 🏥 Health Check

```
GET http://localhost:3000/health
```

Returns bot connection status and uptime.

---

## 📁 File Structure

```
discord-github-bot/
├── index.js        # Entry point: Discord bot + Express webhook server
├── embeds.js       # GitHub event → Discord embed formatters
├── config.json     # Channel routing (hot-reloaded, edit anytime)
├── .env            # Your secrets — never commit this!
├── .env.example    # Template for others to copy
├── .gitignore
└── package.json
```

---

## 🤝 Contributing

Pull requests are welcome! To add support for a new GitHub event:

1. Add the event name and a default channel to `config.json`
2. Add a `formatEventName(payload)` function in `embeds.js`
3. Add a `case` for it in the `buildEmbed()` switch at the bottom of `embeds.js`

---

## 📄 License

MIT — do whatever you want with it.
