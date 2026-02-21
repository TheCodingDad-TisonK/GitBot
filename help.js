// help.js — /help command with category dropdown + pagination (GitBot V2)

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
  routing:       0x9B59B6,
  setup:         0xF1C40F,
  tips:          0xF39C12,
};

// ─── Help content ─────────────────────────────────────────────────────────────

const CATEGORIES = {

  overview: {
    label: "📖 Overview", description: "What GitBot V2 is and how it works",
    color: C.overview,
    pages: [{
      title: "📖 GitBot V2 — Overview",
      description:
        "GitBot V2 is a self-hosted Discord bot that forwards **GitHub webhook events** to channels " +
        "as rich embeds. Events are routed per-type and hot-reload from `config.json` without a restart.\n\n" +
        "V2 adds **muting**, a **live digest**, **context menus**, and fully interactive embeds with " +
        "confirmation flows and undo support.",
      fields: [
        {
          name: "📦 Files",
          value:
            "`index.js`    — bot, webhook server, all interactions\n" +
            "`embeds.js`   — GitHub event → Discord embed formatters\n" +
            "`digest.js`   — in-memory ring buffer (last 50 events)\n" +
            "`mutes.js`    — in-memory mute store\n" +
            "`config.json` — channel routing + `log_channel`\n" +
            "`.env`        — secrets (never commit!)",
        },
        {
          name: "🔒 Webhook security",
          value:
            "Set `GITHUB_WEBHOOK_SECRET` in `.env` to match your GitHub secret. " +
            "Every request is verified via **HMAC-SHA256**.",
        },
        {
          name: "🔄 Hot-reload",
          value: "`config.json` is re-read on **every** incoming event — no restart needed.",
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
        description: "Core commands:",
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
            name: "⚙️ `/config`",
            value:
              "Display the live channel routing table. Muted events show a 🔇 indicator.\n" +
              "Has **🗑️ Dismiss**.",
          },
          {
            name: "🔀 `/route <event> <channel|disable>`",
            value:
              "Change where an event gets posted.\n" +
              "Shows old → new and a **✅ Confirm / ❌ Cancel** before writing.\n" +
              "After confirming, shows **↩️ Undo** for 30 seconds.\n" +
              "Both prompts auto-expire and disable after 30 s.",
          },
        ],
      },
      {
        title: "🤖 Slash Commands — Page 2 / 3",
        description: "Stats + testing:",
        fields: [
          {
            name: "📈 `/events`",
            value:
              "Visual 10-block bar chart of event counts since startup. Muted types show 🔇.\n" +
              "Footer shows totals split by outcome.\n" +
              "Has **🔄 Refresh** + **🗑️ Dismiss**.",
          },
          {
            name: "🧪 `/test [channel]`",
            value:
              "Send a test embed to a channel to verify bot permissions.\n" +
              "The embed has **✅ Looks good!** (deletes it) + **🔁 Resend** (sends a fresh copy).\n" +
              "The slash reply is ephemeral with a jump link.",
          },
          {
            name: "📋 `/digest [count]`",
            value:
              "Paginated view of the last 5–25 events from the ring buffer (default 10).\n" +
              "Each line: outcome icon · relative timestamp · summary · optional jump link.\n" +
              "Has **⬆️ Load more** (adds 10) and **🗑️ Dismiss**.",
          },
          {
            name: "❓ `/help`",
            value: "You're looking at it!",
          },
        ],
      },
      {
        title: "🤖 Slash Commands — Page 3 / 3",
        description: "Muting + admin:",
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
            "Reposts the message to a configurable archive channel.\n\n" +
            "• Set `\"log_channel\": \"github-log\"` in `config.json`.\n" +
            "• Pinned post includes source channel, author, and a **[View original]** link.\n" +
            "• If the message has embeds, the first one is forwarded too.\n" +
            "• Pinned post has an **✅ Acknowledged** button (disables itself when clicked).\n" +
            "• Slash reply is ephemeral.",
        },
        {
          name: "🔁 Resend this embed",
          value:
            "Re-sends a GitBot-generated embed to any configured channel.\n\n" +
            "• Only works on messages sent **by GitBot**.\n" +
            "• Shows channel buttons from your routing config (up to 4 + Cancel).\n" +
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
        description: "Enable/disable any event via `config.json` or `/route`.",
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
          {
            name: "➕ Adding new events",
            value:
              "1. Add `\"event\": \"channel\"` to `config.json`\n" +
              "2. Add `formatEventName(payload)` in `embeds.js`\n" +
              "3. Add a `case` in `buildEmbed()` switch\n" +
              "4. Add to `EVENT_CHOICES` in `index.js`",
          },
        ],
      },
    ],
  },

  routing: {
    label: "🎛️ Channel Routing", description: "Configuring which events go where",
    color: C.routing,
    pages: [{
      title: "🎛️ Channel Routing",
      description:
        "Every event type maps to a Discord channel name in `config.json`, " +
        "re-read on **every** webhook — no restart required.",
      fields: [
        {
          name: "Default routing",
          value:
            "```\n#github-releases  ← release\n#github-commits   ← push, pull_request, create,\n" +
            "                    delete, pull_request_review,\n" +
            "                    workflow_run, check_run,\n" +
            "                    deployment_status\n#github-issues    ← issues, issue_comment,\n" +
            "                    star, fork\n```",
        },
        {
          name: "📌 Log channel (for Pin)",
          value: "Add `\"log_channel\": \"github-log\"` to enable **📌 Pin to GitHub log**.",
        },
        {
          name: "✏️ Edit via /route",
          value:
            "`/route push github-dev` — route push to #github-dev\n" +
            "`/route star disable` — disable star notifications\n" +
            "Triggers confirm → optional undo before writing.",
        },
        {
          name: "⚠️ Rules",
          value:
            "• Channel names are **case-sensitive**, no `#` prefix\n" +
            "• Set to `null` in JSON to disable\n" +
            "• Bot warns in console if a channel can't be found",
        },
      ],
    }],
  },

  setup: {
    label: "⚡ Setup Guide", description: "Step-by-step first-time setup",
    color: C.setup,
    pages: [
      {
        title: "⚡ Setup Guide — Page 1 / 2",
        description: "Get GitBot V2 running:",
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
              "Fill in `DISCORD_TOKEN`, `DISCORD_GUILD_ID`, `WEBHOOK_PORT`, `GITHUB_WEBHOOK_SECRET`.",
          },
        ],
      },
      {
        title: "⚡ Setup Guide — Page 2 / 2",
        description: "Finishing up:",
        fields: [
          {
            name: "5️⃣ Create Discord channels",
            value: "Create `#github-commits`, `#github-releases`, `#github-issues`, and `#github-log`.",
          },
          {
            name: "6️⃣ Start the bot",
            value: "```bash\nnpm start\n```",
          },
          {
            name: "7️⃣ Expose with ngrok (local dev)",
            value: "```bash\nngrok http 3000\n```\nCopy the `https://xxxx.ngrok-free.app` URL.",
          },
          {
            name: "8️⃣ Add the GitHub webhook",
            value:
              "Repo → **Settings → Webhooks → Add webhook**\n" +
              "• Payload URL: `https://xxxx.ngrok-free.app/webhook`\n" +
              "• Content type: `application/json`\n" +
              "• Secret: same as `GITHUB_WEBHOOK_SECRET`\n" +
              "Green ✅ from GitHub = you're set!",
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
              "• Run `/test #channel` to check permissions\n" +
              "• Check `/config` for 🔇 muted events or disabled routes\n" +
              "• Ensure channel name in config matches exactly",
          },
          {
            name: "❌ GitHub shows red ✗",
            value:
              "• Payload URL must end in `/webhook`\n" +
              "• Check bot is running + port is reachable\n" +
              "• `GITHUB_WEBHOOK_SECRET` must match on both sides",
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
              "`[webhook] ✉️  \"push\" → #github-commits`\n" +
              "`[webhook] \"star\" muted — skipping post`\n" +
              "`[webhook] \"unknown_event\" unmapped — skipping`",
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
        ? `Page ${idx + 1} of ${total}  •  GitBot V2 Help`
        : "GitBot V2 Help",
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
  .setDescription("Browse GitBot V2 documentation — commands, context menus, events, and setup")
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
