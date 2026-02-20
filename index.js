// index.js — Discord GitHub Notification Bot
require("dotenv").config();

const { Client, GatewayIntentBits, Collection } = require("discord.js");
const express = require("express");
const crypto  = require("crypto");
const fs      = require("fs");
const path    = require("path");

const { buildEmbed } = require("./embeds");

// ─── Load config ─────────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(__dirname, "config.json");

function loadConfig() {
  delete require.cache[require.resolve(CONFIG_PATH)]; // hot-reload support
  return require(CONFIG_PATH);
}

// ─── Discord Client ───────────────────────────────────────────────────────────

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once("ready", () => {
  console.log(`✅ Discord bot logged in as ${client.user.tag}`);
  console.log(`📡 Webhook server listening on port ${process.env.WEBHOOK_PORT || 3000}`);
  console.log(`\n📋 Channel routing (from config.json):`);
  const cfg = loadConfig();
  Object.entries(cfg.channels).forEach(([event, channel]) => {
    if (channel) console.log(`   ${event.padEnd(25)} → #${channel}`);
  });
  console.log("\n🔗 Point your GitHub webhook to:");
  console.log(`   http://YOUR_IP_OR_NGROK:${process.env.WEBHOOK_PORT || 3000}/webhook\n`);
});

// ─── Helper: find channel by name in guild ────────────────────────────────────

async function getChannel(channelName) {
  const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
  if (!guild) {
    console.error("[bot] Guild not found. Check DISCORD_GUILD_ID in .env");
    return null;
  }
  // Refresh cache if needed
  const channel = guild.channels.cache.find(
    c => c.name === channelName && c.isTextBased()
  );
  if (!channel) {
    console.warn(`[bot] Channel "#${channelName}" not found in guild.`);
  }
  return channel || null;
}

// ─── Helper: verify GitHub webhook signature ─────────────────────────────────

function verifySignature(req) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return true; // skip if not configured

  const sig = req.headers["x-hub-signature-256"];
  if (!sig) return false;

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(JSON.stringify(req.body));
  const expected = "sha256=" + hmac.digest("hex");

  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

// ─── Express Webhook Server ───────────────────────────────────────────────────

const app = express();
app.use(express.json());

app.post("/webhook", async (req, res) => {
  // Verify signature
  if (!verifySignature(req)) {
    console.warn("[webhook] Invalid signature — request rejected");
    return res.status(401).send("Invalid signature");
  }

  const eventType = req.headers["x-github-event"];
  const payload   = req.body;

  if (!eventType) {
    return res.status(400).send("Missing X-GitHub-Event header");
  }

  console.log(`[webhook] Received event: ${eventType} (action: ${payload.action || "n/a"})`);
  res.status(200).send("OK"); // respond fast to GitHub

  // Process async
  try {
    const config = loadConfig(); // reload config each time = hot config changes
    const channelName = config.channels[eventType];

    if (!channelName) {
      console.log(`[webhook] Event "${eventType}" is disabled or unmapped in config.json`);
      return;
    }

    const embed = buildEmbed(eventType, payload);
    if (!embed) {
      console.log(`[webhook] No embed built for event "${eventType}" (action: ${payload.action})`);
      return;
    }

    const channel = await getChannel(channelName);
    if (!channel) return;

    await channel.send({ embeds: [embed] });
    console.log(`[webhook] ✉️  Sent ${eventType} to #${channelName}`);

  } catch (err) {
    console.error(`[webhook] Error handling event "${eventType}":`, err.message);
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    bot: client.isReady() ? "connected" : "disconnected",
    uptime: process.uptime(),
  });
});

// ─── Start Everything ─────────────────────────────────────────────────────────

const PORT = parseInt(process.env.WEBHOOK_PORT || "3000");

app.listen(PORT, () => {
  // Discord login
  client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error("❌ Failed to login to Discord:", err.message);
    process.exit(1);
  });
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n👋 Shutting down...");
  client.destroy();
  process.exit(0);
});
