// help.js — /help command with category dropdown + pagination (GitBot V3)

"use strict";

const {
  SlashCommandBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

// ─── Colours ─────────────────────────────────────────────────────────────────

const C = {
  overview:      0x5865F2,
  commands:      0x3498DB,
  context_menus: 0x9B59B6,
  events:        0x2ECC71,
  setup:         0xF1C40F,
  tips:          0xF39C12,
};

// ─── Help content ─────────────────────────────────────────────────────────────

const CATEGORIES = {

  overview: {
    label: "📖 Overview", description: "What GitBot V3 is and how it works",
    color: C.overview,
    pages: [{
      title: "📖 GitBot V3 — Overview",
      description:
        "GitBot V3 is a self-hosted Discord bot that forwards **GitHub webhook events** to your Discord server as rich embeds.\n\n" +
        "Add any number of repositories with `/repo add` — each gets its own channel, auto-generated webhook secret, " +
        "and a guided DM setup flow for the repo owner. Events are verified, routed, and posted automatically.",
      fields: [
        {
          name: "📦 Files",
          value:
            "`index.js`        — bot, webhook server, all interactions\n" +
            "`embeds.js`       — GitHub event → Discord embed formatters\n" +
            "`digest.js`       — in-memory ring buffer (last 50 events)\n" +
            "`mutes.js`        — in-memory mute store\n" +
            "`database.js`     — SQLite multi-repo store\n" +
            "`multiWebhook.js` — per-repo webhook routing\n" +
            "`repoCommands.js` — `/repo` and `/admin` commands\n" +
            "`poller.js`       — GitHub API polling\n" +
            "`.env`            — secrets (never commit!)",
        },
        {
          name: "🔒 Webhook security",
          value:
            "Each repo gets an **auto-generated HMAC-SHA256 secret** at `/repo add`. " +
            "Set `WEBHOOK_BASE_URL` in `.env` to your ngrok/public URL — the ready-to-paste " +
            "payload URL appears immediately in the reply.",
        },
        {
          name: "🗄️ Multi-repo",
          value:
            "Add unlimited repos with `/repo add owner/repo`. " +
            "Each gets its own Discord channel and webhook endpoint at `/webhook/:id`.",
        },
      ],
    }],
  },

  commands: {
    label: "🤖 Commands", description: "All slash commands and what they do",
    color: C.commands,
    pages: [
      {
        title: "🤖 Slash Commands — Page 1 / 3",
        description: "Repository & admin commands:",
        fields: [
          {
            name: "➕ `/repo add`",
            value:
              "Add a GitHub repository to monitor.\n" +
              "Creates a dedicated channel, generates a webhook secret, and optionally DMs " +
              "setup instructions to the repo owner with a confirm button.\n" +
              "Options: `repository` (required), `channel`, `polling`, `user`.",
          },
          {
            name: "📋 `/repo list [detailed]`",
            value: "List all monitored repositories. Add `detailed:true` for channel, status, and timestamps.",
          },
          {
            name: "📊 `/repo info`",
            value: "Full details for a repository — channel, method, status, error. Has **Enable/Disable** and **Delete** buttons.",
          },
          {
            name: "🗑️ `/repo remove`",
            value: "Permanently remove a repository from monitoring.",
          },
          {
            name: "🔛 `/repo enable`",
            value: "Toggle a repository active or inactive without deleting it.",
          },
          {
            name: "👮 `/admin add / remove / list`",
            value: "Manage bot administrators. Any Discord **Administrator** is automatically an admin.",
          },
        ],
      },
      {
        title: "🤖 Slash Commands — Page 2 / 3",
        description: "Status & monitoring:",
        fields: [
          {
            name: "🏓 `/ping`",
            value:
              "Check if the bot is alive.\n" +
              "Returns colour-coded latency bars for round-trip & WebSocket latency.\n" +
              "Has a **🗑️ Dismiss** button.",
          },
          {
            name: "📊 `/status`",
            value:
              "Show bot health: uptime, WS ping, event counts, and active mutes.\n" +
              "Has **🔄 Refresh** (edits in place, blinks ✅ briefly) + **🗑️ Dismiss**.",
          },
          {
            name: "📈 `/events`",
            value:
              "Visual 10-block bar chart of event counts since startup. Muted types show 🔇.\n" +
              "Footer shows totals split by outcome.\n" +
              "Has **🔄 Refresh** + **🗑️ Dismiss**.",
          },
          {
            name: "📋 `/digest [count]`",
            value:
              "Paginated view of the last 5–25 events from the ring buffer (default 10).\n" +
              "Each line: outcome icon · relative timestamp · summary · optional jump link.\n" +
              "Has **⬆️ Load more** (adds 10) and **🗑️ Dismiss**.",
          },
          {
            name: "🧪 `/test [channel]`",
            value:
              "Send a test embed to a channel to verify bot permissions.\n" +
              "The embed has **✅ Looks good!** (deletes it) + **🔁 Resend** (sends a fresh copy).\n" +
              "The slash reply is ephemeral with a jump link.",
          },
        ],
      },
      {
        title: "🤖 Slash Commands — Page 3 / 3",
        description: "Muting + other:",
        fields: [
          {
            name: "🔇 `/mute <event> [reason]`",
            value:
              "Silence an event type without disabling it entirely.\n" +
              "Duration picker: **15 min / 1 hour / 6 hours / 24 hours / Cancel**.\n" +
              "After muting: shows expiry timestamp + **🔔 Unmute now** button.\n" +
              "If already muted: shows remaining time + Unmute button.\n" +
              "Muted events are still counted — just not posted.",
          },
          {
            name: "🔕 `/watchlist`",
            value:
              "List all active mutes with expiry, who muted it, and reason.\n" +
              "Each mute has its own **🔔 Unmute** button.\n" +
              "Reply is ephemeral.",
          },
          {
            name: "🗑️ `/clear-stats`",
            value:
              "Reset all event counters and the uptime clock.\n" +
              "Shows **🗑️ Yes, reset / ❌ Never mind** before acting.\n" +
              "Prompt auto-expires after 30 s. Digest ring buffer is preserved.",
          },
          {
            name: "❓ `/help`",
            value: "You're looking at it!",
          },
        ],
      },
    ],
  },

  context_menus: {
    label: "🖱️ Context Menus", description: "Right-click message actions",
    color: C.context_menus,
    pages: [{
      title: "🖱️ Context Menu Commands",
      description:
        "Right-click any message → **Apps** to see these options.\n\n" +
        "Both are **Message** context menus.",
      fields: [
        {
          name: "📌 Pin to GitHub log",
          value:
            "Reposts the message to `#github-log` as a permanent archive.\n\n" +
            "• Pinned post includes source channel, author, and a **[View original]** link.\n" +
            "• If the message has embeds, the first one is forwarded too.\n" +
            "• Pinned post has an **✅ Acknowledged** button (disables itself when clicked).\n" +
            "• Slash reply is ephemeral.",
        },
        {
          name: "🔁 Resend this embed",
          value:
            "Re-sends a GitBot-generated embed to any channel.\n\n" +
            "• Only works on messages sent **by GitBot**.\n" +
            "• Shows buttons for up to 4 available channels + Cancel.\n" +
            "• The resent message includes a footer showing who resent it and from where.\n" +
            "• Slash reply is ephemeral.",
        },
      ],
    }],
  },

  events: {
    label: "📡 GitHub Events", description: "Supported event types",
    color: C.events,
    pages: [
      {
        title: "📡 Supported Events — Page 1 / 2",
        description: "All events are handled automatically per repository. Use `/mute` to silence any event type temporarily.",
        fields: [
          { name: "📦 `push`",                value: "Commits pushed to any branch.", inline: true },
          { name: "🔀 `pull_request`",         value: "PR opened, merged, closed, review requested.", inline: true },
          { name: "🐛 `issues`",               value: "Issue opened, closed, or reopened.", inline: true },
          { name: "💬 `issue_comment`",        value: "New comment on an issue.", inline: true },
          { name: "🔍 `pull_request_review`",  value: "PR review submitted.", inline: true },
          { name: "🚀 `release`",              value: "Release published.", inline: true },
          { name: "🌿 `create`",               value: "Branch or tag created.", inline: true },
          { name: "🗑️ `delete`",               value: "Branch or tag deleted.", inline: true },
        ],
      },
      {
        title: "📡 Supported Events — Page 2 / 2",
        description: "More event types:",
        fields: [
          { name: "⭐ `star`",               value: "Repo starred or unstarred.", inline: true },
          { name: "🍴 `fork`",               value: "Repo forked.", inline: true },
          { name: "✅ `workflow_run`",       value: "GitHub Actions workflow completed.", inline: true },
          { name: "🔎 `check_run`",          value: "CI check failed/anomaly (successes are silent).", inline: true },
          { name: "🚢 `deployment_status`",  value: "Deployment status updated.", inline: true },
          { name: "🏓 `ping`",               value: "GitHub connectivity test — posts a confirmation embed in the repo's channel.", inline: true },
          {
            name: "➕ Adding new events",
            value:
              "1. Add `formatEventName(payload)` in `embeds.js`\n" +
              "2. Add a `case` in `buildEmbed()` switch in `embeds.js`\n" +
              "3. Add to `EVENT_CHOICES` in `index.js` so it appears in `/mute`",
          },
        ],
      },
    ],
  },

  setup: {
    label: "⚡ Setup Guide", description: "Step-by-step first-time setup",
    color: C.setup,
    pages: [
      {
        title: "⚡ Setup Guide — Page 1 / 2",
        description: "Get GitBot V3 running:",
        fields: [
          {
            name: "1️⃣ Clone & install",
            value: "```bash\ngit clone https://github.com/YOUR_USER/discord-github-bot\ncd discord-github-bot\nnpm install\n```",
          },
          {
            name: "2️⃣ Create a Discord bot",
            value:
              "[Discord Developer Portal](https://discord.com/developers/applications) → " +
              "**New Application** → **Bot** → copy token.\n" +
              "Enable **Server Members** and **Message Content** intents.",
          },
          {
            name: "3️⃣ Invite the bot",
            value:
              "OAuth2 → URL Generator → scope `bot` → permissions:\n" +
              "`Send Messages`, `Embed Links`, `View Channels`",
          },
          {
            name: "4️⃣ Configure .env",
            value:
              "```bash\ncp .env.example .env\n```\n" +
              "Fill in `DISCORD_TOKEN`, `DISCORD_GUILD_ID`, `WEBHOOK_PORT`, and `WEBHOOK_BASE_URL` (your ngrok URL).",
          },
        ],
      },
      {
        title: "⚡ Setup Guide — Page 2 / 2",
        description: "Finishing up:",
        fields: [
          {
            name: "5️⃣ Start ngrok",
            value: "```bash\nngrok http 3000\n```\nCopy the `https://xxxx.ngrok-free.app` URL and set it as `WEBHOOK_BASE_URL` in `.env`.",
          },
          {
            name: "6️⃣ Start the bot",
            value: "```bash\nnpm start\n```",
          },
          {
            name: "7️⃣ Add a repository",
            value:
              "In Discord, run:\n```\n/repo add owner/repo\n```\n" +
              "GitBot will create a channel and reply with a ready-to-paste **Payload URL** and **Secret**.",
          },
          {
            name: "8️⃣ Paste into GitHub",
            value:
              "Repo → **Settings → Webhooks → Add webhook**\n" +
              "• Paste the **Payload URL** and **Secret** from the `/repo add` reply\n" +
              "• Content type: `application/json`\n" +
              "Green ✅ from GitHub = you're all set!",
          },
        ],
      },
    ],
  },

  tips: {
    label: "💡 Tips & Deployment", description: "Hosting options and troubleshooting",
    color: C.tips,
    pages: [
      {
        title: "💡 Deployment Options",
        description: "Keep GitBot running 24/7:",
        fields: [
          {
            name: "🚂 Railway (easiest)",
            value: "Push to GitHub → [railway.app](https://railway.app) → New Project → Deploy from GitHub → add env vars.",
          },
          {
            name: "🎨 Render (free tier)",
            value:
              "[render.com](https://render.com) → New Web Service → connect repo → add env vars.\n" +
              "⚠️ Free tier sleeps; ~30 s wake time on first webhook.",
          },
          {
            name: "🖥️ VPS (DigitalOcean / Hetzner)",
            value: "```bash\nnpm install -g pm2\npm2 start index.js --name gitbot\npm2 save && pm2 startup\n```",
          },
        ],
      },
      {
        title: "💡 Troubleshooting",
        description: "Common issues and quick fixes:",
        fields: [
          {
            name: "❌ Bot doesn't post",
            value:
              "• Run `/test` to check the bot has permissions in the channel\n" +
              "• Run `/watchlist` to check for active mutes\n" +
              "• Run `/repo list` to confirm the repo is active and pointing to the right channel",
          },
          {
            name: "❌ GitHub shows red ✗",
            value:
              "• Payload URL must match exactly — e.g. `https://your-url/webhook/1`\n" +
              "• Check the bot is running and ngrok is connected (`/health`)\n" +
              "• The webhook secret in GitHub must match what was generated at `/repo add`",
          },
          {
            name: "🔎 Health check",
            value:
              "```\nGET http://localhost:3000/health\n```\n" +
              "Returns version, bot status, uptime, active mutes, and event stats.",
          },
          {
            name: "📝 Console logs",
            value:
              "`[webhook] ✉️  \"push\" from owner/repo → #github-owner-repo`\n" +
              "`[webhook] \"star\" muted — skipping post`\n" +
              "`[webhook] 🏓 Ping received for owner/repo — webhook is live`",
          },
        ],
      },
    ],
  },
};

// ─── ID encoding ──────────────────────────────────────────────────────────────

const PFX = "help";

function encodeId(cat, pg)  { return `${PFX}:${cat}:${pg}`; }
function decodeId(id) {
  const [, cat, pg] = id.split(":");
  return { category: cat, page: parseInt(pg, 10) };
}

// ─── Message builder ──────────────────────────────────────────────────────────

function buildHelpMessage(categoryKey, pageIndex) {
  const cat   = CATEGORIES[categoryKey];
  const total = cat.pages.length;
  const idx   = Math.max(0, Math.min(pageIndex, total - 1));
  const page  = cat.pages[idx];

  const embed = new EmbedBuilder()
    .setColor(cat.color)
    .setTitle(page.title)
    .setDescription(page.description)
    .setFooter({
      text: total > 1
        ? `Page ${idx + 1} of ${total}  •  GitBot V3 Help`
        : "GitBot V3 Help",
    })
    .setTimestamp();

  for (const f of (page.fields || [])) {
    embed.addFields({ name: f.name, value: f.value, inline: f.inline ?? false });
  }

  // Dropdown — always visible
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${PFX}:select`)
    .setPlaceholder(`📂 ${cat.label}`)
    .addOptions(
      Object.entries(CATEGORIES).map(([key, c]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(c.label)
          .setDescription(c.description)
          .setValue(encodeId(key, 0))
          .setDefault(key === categoryKey)
      )
    );

  const rows = [new ActionRowBuilder().addComponents(select)];

  // Pagination buttons (only when multiple pages)
  if (total > 1) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(encodeId(categoryKey, idx - 1))
        .setLabel("← Previous")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(idx === 0),
      new ButtonBuilder()
        .setCustomId(encodeId(categoryKey, idx + 1))
        .setLabel("Next →")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(idx === total - 1),
    ));
  }

  return { embeds: [embed], components: rows };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

const helpCommand = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Browse GitBot V3 documentation — commands, context menus, events, and setup")
  .toJSON();

async function handleHelpInteraction(interaction) {
  // /help slash command
  if (interaction.isChatInputCommand() && interaction.commandName === "help") {
    await interaction.reply({ ...buildHelpMessage("overview", 0), ephemeral: false });
    return true;
  }

  // Category dropdown
  if (interaction.isStringSelectMenu() && interaction.customId === `${PFX}:select`) {
    const { category, page } = decodeId(interaction.values[0]);
    await interaction.update(buildHelpMessage(category, page));
    return true;
  }

  // Pagination buttons
  if (interaction.isButton()) {
    const id = interaction.customId;
    if (!id.startsWith(`${PFX}:`) || id === `${PFX}:select`) return false;
    const { category, page } = decodeId(id);
    if (!CATEGORIES[category]) return false;
    await interaction.update(buildHelpMessage(category, page));
    return true;
  }

  return false;
}

module.exports = { helpCommand, handleHelpInteraction };