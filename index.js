// index.js — Discord GitHub Notification Bot
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActivityType,
} = require("discord.js");
const express = require("express");
const crypto  = require("crypto");
const fs      = require("fs");
const path    = require("path");

const { buildEmbed } = require("./embeds");

// ─── Startup validation ───────────────────────────────────────────────────────

const REQUIRED_ENV = ["DISCORD_TOKEN", "DISCORD_GUILD_ID"];
const missingEnv   = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length) {
  console.error(`❌ Missing required environment variables: ${missingEnv.join(", ")}`);
  console.error("   Copy .env.example to .env and fill in your values.");
  process.exit(1);
}

// ─── Load config ──────────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(__dirname, "config.json");

function loadConfig() {
  // Bust the require cache so config.json is always freshly read from disk.
  // This enables hot-reload — no restart needed after editing the file.
  delete require.cache[require.resolve(CONFIG_PATH)];
  return require(CONFIG_PATH);
}

// ─── Stats tracking ───────────────────────────────────────────────────────────

const stats = {
  eventsReceived:  0,   // total webhook POSTs processed
  eventsSent:      0,   // successfully posted to Discord
  eventsDropped:   0,   // embed built but channel missing / Discord API error
  eventsIgnored:   0,   // disabled in config, or no embed for this action variant
  startTime:       Date.now(),
  lastEvent:       null,
  lastEventTime:   null,
  eventCounts:     {},  // { eventType: count } — used by /events breakdown
};

/**
 * Record an incoming event outcome.
 * @param {string} eventType  GitHub event name (e.g. "push")
 * @param {'sent'|'dropped'|'ignored'} outcome
 */
function recordEvent(eventType, outcome) {
  stats.eventsReceived++;
  stats.lastEvent     = eventType;
  stats.lastEventTime = new Date();
  stats.eventCounts[eventType] = (stats.eventCounts[eventType] || 0) + 1;
  if      (outcome === "sent")    stats.eventsSent++;
  else if (outcome === "dropped") stats.eventsDropped++;
  else                            stats.eventsIgnored++;
}

// ─── Discord Client ───────────────────────────────────────────────────────────

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ─── Slash Command Definitions ────────────────────────────────────────────────

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check if the bot is alive and measure latency"),

  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Show bot status, uptime, and event statistics"),

  new SlashCommandBuilder()
    .setName("config")
    .setDescription("Display the current channel routing configuration"),

  new SlashCommandBuilder()
    .setName("route")
    .setDescription("Change where a GitHub event type gets posted")
    .addStringOption(opt =>
      opt.setName("event")
        .setDescription("GitHub event type (e.g. push, pull_request)")
        .setRequired(true)
        .addChoices(
          { name: "push",                value: "push"                },
          { name: "pull_request",        value: "pull_request"        },
          { name: "issues",              value: "issues"              },
          { name: "issue_comment",       value: "issue_comment"       },
          { name: "pull_request_review", value: "pull_request_review" },
          { name: "release",             value: "release"             },
          { name: "workflow_run",        value: "workflow_run"        },
          { name: "star",                value: "star"                },
          { name: "fork",                value: "fork"                },
          { name: "create",              value: "create"              },
          { name: "delete",              value: "delete"              },
          { name: "check_run",           value: "check_run"           },
          { name: "deployment_status",   value: "deployment_status"   },
        )
    )
    .addStringOption(opt =>
      opt.setName("channel")
        .setDescription("Channel name to route to, or 'disable' to turn off")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("events")
    .setDescription("Show a breakdown of all events received since bot started"),

  new SlashCommandBuilder()
    .setName("test")
    .setDescription("Send a test embed to verify a channel is set up correctly")
    .addStringOption(opt =>
      opt.setName("channel")
        .setDescription("Channel name to test (defaults to first configured channel)")
        .setRequired(false)
    ),
].map(cmd => cmd.toJSON());

// ─── Register slash commands ──────────────────────────────────────────────────

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log("⏳ Registering slash commands...");
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, process.env.DISCORD_GUILD_ID),
      { body: commands }
    );
    console.log("✅ Slash commands registered!");
  } catch (err) {
    console.error("❌ Failed to register slash commands:", err.message);
  }
}

// ─── Bot presence rotation ────────────────────────────────────────────────────
// Note: ActivityType.Custom is only available to human user accounts, not bots.
// We use Watching and Playing, which are fully supported for bot accounts.

const presenceMessages = [
  () => ({ name: "GitHub webhooks",                   type: ActivityType.Watching }),
  () => ({ name: `${stats.eventsReceived} events`,    type: ActivityType.Playing  }),
  () => {
    const mins = Math.floor((Date.now() - stats.startTime) / 60_000);
    return { name: `up for ${mins}m`, type: ActivityType.Playing };
  },
  () => {
    const last = stats.lastEvent;
    return last
      ? { name: `last: ${last}`,       type: ActivityType.Watching }
      : { name: "awaiting events…",    type: ActivityType.Watching };
  },
];

let presenceIndex = 0;
function rotatePresence() {
  const msg = presenceMessages[presenceIndex % presenceMessages.length]();
  client.user.setPresence({ status: "online", activities: [msg] });
  presenceIndex++;
}

// ─── Slash command handlers ───────────────────────────────────────────────────

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // /ping — round-trip and WebSocket latency
  if (commandName === "ping") {
    const sent    = await interaction.reply({ content: "🏓 Pinging...", fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(
      `🏓 Pong!\n> **Round-trip:** ${latency}ms\n> **WebSocket:** ${client.ws.ping}ms`
    );
  }

  // /status — uptime, ping, event counts
  else if (commandName === "status") {
    const uptimeSec = Math.floor((Date.now() - stats.startTime) / 1000);
    const h = Math.floor(uptimeSec / 3600);
    const m = Math.floor((uptimeSec % 3600) / 60);
    const s = uptimeSec % 60;

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle("🤖 GitHub Bot Status")
      .setThumbnail(client.user.displayAvatarURL())
      .addFields(
        { name: "🟢 Connection", value: `Connected as **${client.user.tag}**`, inline: false },
        { name: "⏱️ Uptime",     value: `${h}h ${m}m ${s}s`,                  inline: true  },
        { name: "📡 WS Ping",    value: `${client.ws.ping}ms`,                 inline: true  },
        { name: "📬 Received",   value: String(stats.eventsReceived),           inline: true  },
        { name: "✉️ Sent",       value: String(stats.eventsSent),               inline: true  },
        { name: "🚫 Dropped",    value: String(stats.eventsDropped),            inline: true  },
        { name: "⏭️ Ignored",    value: String(stats.eventsIgnored),            inline: true  },
        { name: "📦 Port",       value: String(process.env.WEBHOOK_PORT || 3000), inline: true },
      )
      .setFooter({
        text: stats.lastEvent
          ? `Last: ${stats.lastEvent} at ${stats.lastEventTime?.toLocaleTimeString()}`
          : "No events yet",
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  // /config — display live channel routing table
  else if (commandName === "config") {
    const config = loadConfig();
    const rows = Object.entries(config.channels)
      .map(([evt, ch]) => `\`${evt.padEnd(22)}\` → ${ch ? `**#${ch}**` : "~~disabled~~"}`)
      .join("\n");

    const embed = new EmbedBuilder()
      .setColor(0x3498DB)
      .setTitle("⚙️ Channel Routing Config")
      .setDescription(rows)
      .setFooter({ text: "Edit config.json to change routing — hot-reloaded on every event" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  // /route — update a single event→channel mapping and persist to disk
  else if (commandName === "route") {
    const eventArg   = interaction.options.getString("event");
    const channelArg = interaction.options.getString("channel");
    const newChannel = channelArg.toLowerCase() === "disable" ? null : channelArg.replace(/^#/, "");

    const config = loadConfig();
    config.channels[eventArg] = newChannel;

    // Strip internal metadata keys (prefixed with _) before writing back to disk.
    // These are comments for humans and should not be re-written if absent.
    const toWrite = {
      channels: config.channels,
    };

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(toWrite, null, 2));

    const embed = new EmbedBuilder()
      .setColor(newChannel ? 0x2ECC71 : 0xE74C3C)
      .setTitle("⚙️ Route Updated")
      .setDescription(
        newChannel
          ? `**\`${eventArg}\`** events will now be posted to **#${newChannel}**`
          : `**\`${eventArg}\`** events are now **disabled**`
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  // /events — bar chart breakdown of received event types
  else if (commandName === "events") {
    if (stats.eventsReceived === 0) {
      return interaction.reply("📭 No events received yet since bot started.");
    }

    const rows = Object.entries(stats.eventCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([evt, count]) => {
        const bar = "█".repeat(Math.round((count / stats.eventsReceived) * 10));
        return `\`${evt.padEnd(22)}\` **${count}** ${bar}`;
      })
      .join("\n");

    const embed = new EmbedBuilder()
      .setColor(0xF39C12)
      .setTitle(`📊 Event Breakdown (${stats.eventsReceived} total)`)
      .setDescription(rows)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  // /test — send a test embed to a named channel to verify bot permissions
  else if (commandName === "test") {
    // Default to the first non-null configured channel if none specified
    let channelName = interaction.options.getString("channel");
    if (!channelName) {
      const config = loadConfig();
      channelName  = Object.values(config.channels).find(ch => ch != null) || "github-general";
    }
    channelName = channelName.replace(/^#/, "");

    const channel = await getChannel(channelName);
    if (!channel) {
      return interaction.reply({
        content: `❌ Could not find channel **#${channelName}**. Make sure it exists in this server.`,
        ephemeral: true,
      });
    }

    const port = process.env.WEBHOOK_PORT || 3000;
    const testEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setAuthor({ name: client.user.tag, iconURL: client.user.displayAvatarURL() })
      .setTitle("✅ Test Notification")
      .setDescription("If you can see this, your GitHub bot is configured correctly and can post to this channel!")
      .addFields(
        { name: "Webhook URL",  value: `\`http://YOUR_IP:${port}/webhook\``, inline: false },
        { name: "Health Check", value: `\`http://YOUR_IP:${port}/health\``,  inline: false }
      )
      .setTimestamp();

    await channel.send({ embeds: [testEmbed] });
    await interaction.reply({ content: `✅ Test embed sent to **#${channelName}**!`, ephemeral: true });
  }
});

// ─── Bot ready ────────────────────────────────────────────────────────────────

client.once("ready", async () => {
  console.log(`✅ Discord bot logged in as ${client.user.tag}`);
  console.log(`📡 Webhook server listening on port ${process.env.WEBHOOK_PORT || 3000}`);

  const cfg = loadConfig();
  console.log("\n📋 Channel routing (from config.json):");
  Object.entries(cfg.channels).forEach(([evt, ch]) => {
    console.log(`   ${evt.padEnd(25)} → ${ch ? `#${ch}` : "(disabled)"}`);
  });
  console.log("\n🔗 Point your GitHub webhook to:");
  console.log(`   http://YOUR_IP_OR_NGROK:${process.env.WEBHOOK_PORT || 3000}/webhook\n`);

  client.user.setPresence({
    status:     "online",
    activities: [{ name: "GitHub webhooks", type: ActivityType.Watching }],
  });

  setInterval(rotatePresence, 30_000);

  await registerCommands();
});

// ─── Helper: resolve a channel by name in the configured guild ────────────────

async function getChannel(channelName) {
  const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
  if (!guild) {
    console.error("[bot] Guild not found — check DISCORD_GUILD_ID in .env");
    return null;
  }

  // Try cache first; fall back to a network fetch if the cache is cold/stale.
  let channel = guild.channels.cache.find(c => c.name === channelName && c.isTextBased());
  if (!channel) {
    try {
      const fetched = await guild.channels.fetch();
      channel = fetched.find(c => c?.name === channelName && c.isTextBased()) || null;
    } catch (err) {
      console.error(`[bot] Failed to fetch channels from API: ${err.message}`);
    }
  }

  if (!channel) {
    console.warn(`[bot] Channel "#${channelName}" not found in guild.`);
  }
  return channel || null;
}

// ─── Helper: verify GitHub HMAC-SHA256 webhook signature ─────────────────────
// We sign the raw request body buffer, NOT re-serialized JSON.
// JSON.stringify(req.body) can produce different byte sequences (key order,
// whitespace) from what GitHub originally sent, causing false rejections.

function verifySignature(rawBody, sig) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  // If no secret is configured, skip verification (convenient for local dev)
  if (!secret) return true;
  if (!sig)    return false;

  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    // timingSafeEqual prevents timing attacks; both buffers must be same length
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ─── Express webhook server ───────────────────────────────────────────────────

const app = express();

// Capture the raw body buffer via express.json's verify hook BEFORE it's parsed.
// This is required for correct HMAC signature verification (see verifySignature).
app.use(
  express.json({
    verify: (req, _res, buf) => { req.rawBody = buf; },
  })
);

app.post("/webhook", async (req, res) => {
  // Guard against events arriving before the Discord client has connected
  if (!client.isReady()) {
    return res.status(503).send("Bot not ready yet — try again in a moment");
  }

  const sig       = req.headers["x-hub-signature-256"];
  const eventType = req.headers["x-github-event"];
  const payload   = req.body;

  if (!verifySignature(req.rawBody, sig)) {
    console.warn("[webhook] Invalid signature — request rejected");
    return res.status(401).send("Invalid signature");
  }

  if (!eventType) {
    return res.status(400).send("Missing X-GitHub-Event header");
  }

  console.log(`[webhook] Received: ${eventType} (action: ${payload.action || "n/a"})`);
  // Respond to GitHub immediately — their delivery timeout is short (10s)
  res.status(200).send("OK");

  try {
    const config      = loadConfig();
    const channelName = config.channels[eventType];

    // null  = explicitly disabled in config
    // undefined = event type not listed in config at all
    if (!channelName) {
      console.log(`[webhook] "${eventType}" is disabled or unmapped — skipping`);
      recordEvent(eventType, "ignored");
      return;
    }

    const embed = buildEmbed(eventType, payload);
    if (!embed) {
      // Some events only produce embeds for specific actions (e.g. issue_comment
      // only fires on "created"). A null return is intentional, not an error.
      console.log(`[webhook] No embed for "${eventType}" action="${payload.action}" — skipping`);
      recordEvent(eventType, "ignored");
      return;
    }

    const channel = await getChannel(channelName);
    if (!channel) {
      recordEvent(eventType, "dropped");
      return;
    }

    await channel.send({ embeds: [embed] });
    recordEvent(eventType, "sent");
    console.log(`[webhook] ✉️  Sent "${eventType}" to #${channelName}`);

  } catch (err) {
    console.error(`[webhook] Error handling "${eventType}":`, err.message);
    recordEvent(eventType, "dropped");
  }
});

// Health check endpoint — useful for uptime monitors and verifying bot state
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    bot:    client.isReady() ? "connected" : "disconnected",
    uptime: process.uptime(),
    stats: {
      eventsReceived: stats.eventsReceived,
      eventsSent:     stats.eventsSent,
      eventsDropped:  stats.eventsDropped,
      eventsIgnored:  stats.eventsIgnored,
      lastEvent:      stats.lastEvent,
      lastEventTime:  stats.lastEventTime,
    },
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.WEBHOOK_PORT || "3000", 10);

app.listen(PORT, () => {
  console.log(`🌐 Webhook server listening on port ${PORT}`);
  client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error("❌ Failed to login to Discord:", err.message);
    process.exit(1);
  });
});

// Graceful shutdown on Ctrl-C or process termination signal
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

function shutdown(signal) {
  console.log(`\n👋 Received ${signal} — shutting down…`);
  client.destroy();
  process.exit(0);
}