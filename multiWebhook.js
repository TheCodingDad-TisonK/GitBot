// multiWebhook.js — Express webhook server with multi-repo support
// Routes webhooks to the correct repository based on URL path or payload

"use strict";

const express = require("express");
const crypto  = require("crypto");

const db       = require("./database");
const { buildEmbed } = require("./embeds");
const digest   = require("./digest");
const mutes    = require("./mutes");

// ─── Stats (shared with main) ─────────────────────────────────────────────────

const stats = {
  eventsReceived: 0,
  eventsSent:     0,
  eventsDropped:  0,
  eventsIgnored:  0,
  eventsMuted:    0,
};

function recordEvent(eventType, outcome) {
  stats.eventsReceived++;
  if      (outcome === "sent")    stats.eventsSent++;
  else if (outcome === "dropped") stats.eventsDropped++;
  else if (outcome === "muted")   stats.eventsMuted++;
  else                            stats.eventsIgnored++;
}

// ─── Signature Verification ───────────────────────────────────────────────────

/**
 * Verify GitHub webhook signature
 */
function verifySignature(rawBody, signature, secret) {
  if (!secret) return true;
  if (!signature) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ─── Webhook Router ───────────────────────────────────────────────────────────

/**
 * Create webhook router for a Discord client
 */
function createWebhookRouter(client, getChannel) {
  const router = express.Router();
  
  // Raw body parser for signature verification
  router.use(express.json({
    verify: (req, _res, buf) => { req.rawBody = buf; },
  }));
  
  // Health check — used by monitoring tools and the /help troubleshooting guide
  router.get("/health", (_req, res) => {
    res.json({
      status:   "ok",
      version:  "3.0.1",
      mode:     "multi-repo",
      bot:      client.isReady() ? "connected" : "disconnected",
      uptime:   process.uptime(),
      repos:    db.getAllRepositories().length,
      polling:  db.getPollableRepositories().length,
      mutes:    mutes.list().map(m => ({
        event:     m.eventType,
        expiresAt: m.expiresAt,
        reason:    m.reason,
      })),
      stats: {
        eventsReceived: stats.eventsReceived,
        eventsSent:     stats.eventsSent,
        eventsDropped:  stats.eventsDropped,
        eventsIgnored:  stats.eventsIgnored,
        eventsMuted:    stats.eventsMuted,
      },
    });
  });
  
  // Main webhook endpoint (legacy - uses default channel)
  router.post("/webhook", (req, res) => handleWebhook(req, res, client, null, getChannel));
  
  // Per-repository webhook: /webhook/:repoId
  router.post("/webhook/:repoId", (req, res) => {
    const repoId = parseInt(req.params.repoId, 10);
    if (isNaN(repoId)) {
      return res.status(400).send("Invalid repository ID");
    }
    handleWebhook(req, res, client, repoId, getChannel);
  });
  
  // Per-repository webhook by name: /webhook/owner/repo
  router.post("/webhook/:owner/:repo", (req, res) => {
    const { owner, repo } = req.params;
    const repoData = db.getRepositoryByFullName(`${owner}/${repo}`);
    if (!repoData) {
      return res.status(404).send("Repository not found");
    }
    handleWebhook(req, res, client, repoData.id, getChannel);
  });
  
  return router;
}

/**
 * Main webhook handler
 */
async function handleWebhook(req, res, client, repoId, getChannel) {
  if (!client.isReady()) {
    return res.status(503).send("Bot not ready");
  }
  
  const sig       = req.headers["x-hub-signature-256"];
  const eventType = req.headers["x-github-event"];
  const payload   = req.body;
  
  if (!eventType) {
    return res.status(400).send("Missing X-GitHub-Event header");
  }
  
  // Respond immediately — GitHub's delivery timeout is 10s
  res.status(200).send("OK");
  
  // If no specific repo, try to find by payload
  let repo = null;
  if (repoId) {
    repo = db.getRepositoryById(repoId);
  } else {
    // Try to find repo from payload
    const repoFullName = payload?.repository?.full_name;
    if (repoFullName) {
      repo = db.getRepositoryByFullName(repoFullName);
    }
  }
  
  // If still no repo, fall back to legacy behavior (config-based)
  if (!repo) {
    console.log(`[webhook] No repo found, using legacy routing for ${eventType}`);
    return handleLegacyWebhook(req, res, client, getChannel);
  }
  
  // Check if repo is active
  if (!repo.is_active) {
    console.log(`[webhook] Repo ${repo.full_name} is inactive, skipping`);
    digest.push(eventType, payload, "ignored");
    recordEvent(eventType, "ignored");
    return;
  }
  
  // Verify webhook secret if configured
  if (repo.webhook_secret) {
    if (!verifySignature(req.rawBody, sig, repo.webhook_secret)) {
      console.warn(`[webhook] Invalid signature for ${repo.full_name} - rejecting`);
      digest.push(eventType, payload, "ignored");
      recordEvent(eventType, "ignored");
      return;
    }
  } else {
    // No secret configured - still accept (for backward compatibility)
    console.log(`[webhook] No secret configured for ${repo.full_name} - accepting without verification`);
  }
  
  console.log(`[webhook] ${eventType} from ${repo.full_name} (action: ${payload.action || "n/a"})`);

  // ── Handle ping (GitHub fires this when a webhook is first saved) ──────────
  if (eventType === "ping") {
    console.log(`[webhook] 🏓 Ping received for ${repo.full_name} — webhook is live`);
    try {
      const channel = await client.channels.fetch(repo.channel_id);
      if (channel) {
        const pingEmbed = new (require("discord.js").EmbedBuilder)()
          .setColor(0x2ECC71)
          .setTitle("🏓 GitHub Ping Received")
          .setDescription(
            `GitHub successfully reached the webhook for **${repo.full_name}**.\n\n` +
            `The connection is live — events will now appear in this channel.`
          )
          .addFields(
            { name: "Repository", value: `[${repo.full_name}](${payload.repository?.html_url || `https://github.com/${repo.full_name}`})`, inline: true },
            { name: "Hook ID",    value: String(payload.hook_id || "—"), inline: true },
          )
          .setFooter({ text: "Waiting for you to click ✅ I've added the webhook in your DM" })
          .setTimestamp();

        await channel.send({ embeds: [pingEmbed] });
      }
    } catch (err) {
      console.error(`[webhook] Could not post ping embed for ${repo.full_name}: ${err.message}`);
    }
    digest.push(eventType, payload, "sent", repo.full_name);
    recordEvent(eventType, "sent");
    return;
  }

  try {
    // Check if event is muted
    if (mutes.isMuted(eventType)) {
      console.log(`[webhook] "${eventType}" muted — skipping post`);
      digest.push(eventType, payload, "muted", repo.full_name);
      recordEvent(eventType, "muted");
      return;
    }
    
    // Build embed
    const embed = buildEmbed(eventType, payload);
    if (!embed) {
      console.log(`[webhook] No embed for "${eventType}" action="${payload.action}" — skipping`);
      digest.push(eventType, payload, "ignored", repo.full_name);
      recordEvent(eventType, "ignored");
      return;
    }
    
    // Add repository info to embed
    embed.setFooter({
      text: `Repository: ${repo.full_name}`,
      iconURL: payload.repository?.owner?.avatar_url || undefined,
    });
    
    // Get channel
    const channelId = repo.channel_id;
    if (!channelId) {
      console.log(`[webhook] No channel configured for ${repo.full_name}`);
      digest.push(eventType, payload, "dropped", repo.full_name);
      recordEvent(eventType, "dropped");
      return;
    }
    
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      console.error(`[webhook] Channel ${channelId} not found for ${repo.full_name}`);
      digest.push(eventType, payload, "dropped", repo.full_name);
      recordEvent(eventType, "dropped");
      return;
    }
    
    // Send the embed
    await channel.send({ embeds: [embed] });
    digest.push(eventType, payload, "sent", repo.full_name);
    recordEvent(eventType, "sent");
    console.log(`[webhook] ✉️  "${eventType}" from ${repo.full_name} → #${channel.name}`);
    
  } catch (err) {
    console.error(`[webhook] Error on "${eventType}" from ${repo.full_name}: ${err.message}`);
    digest.push(eventType, payload, "dropped", repo.full_name);
    recordEvent(eventType, "dropped");
  }
}

/**
 * Legacy webhook handler (config.json based routing)
 */
async function handleLegacyWebhook(req, res, client, getChannel) {
  const sig       = req.headers["x-hub-signature-256"];
  const eventType = req.headers["x-github-event"];
  const payload   = req.body;
  
  if (!verifySignature(req.rawBody, sig, process.env.GITHUB_WEBHOOK_SECRET)) {
    console.warn("[webhook] Invalid signature — rejected");
    return;
  }
  
  console.log(`[webhook] (legacy) ${eventType}`);
  
  try {
    // Load legacy config
    const fs = require("fs");
    const path = require("path");
    const CONFIG_PATH = path.join(__dirname, "config.json");
    delete require.cache[require.resolve(CONFIG_PATH)];
    const cfg = require(CONFIG_PATH);
    
    const channelName = cfg.channels?.[eventType];
    if (!channelName) {
      console.log(`[webhook] "${eventType}" unmapped — skipping`);
      digest.push(eventType, payload, "ignored");
      recordEvent(eventType, "ignored");
      return;
    }
    
    if (mutes.isMuted(eventType)) {
      console.log(`[webhook] "${eventType}" muted — skipping post`);
      digest.push(eventType, payload, "muted");
      recordEvent(eventType, "muted");
      return;
    }
    
    const embed = buildEmbed(eventType, payload);
    if (!embed) {
      console.log(`[webhook] No embed for "${eventType}" — skipping`);
      digest.push(eventType, payload, "ignored");
      recordEvent(eventType, "ignored");
      return;
    }
    
    const channel = await getChannel(channelName);
    if (!channel) {
      digest.push(eventType, payload, "dropped");
      recordEvent(eventType, "dropped");
      return;
    }
    
    await channel.send({ embeds: [embed] });
    digest.push(eventType, payload, "sent");
    recordEvent(eventType, "sent");
    console.log(`[webhook] ✉️  "${eventType}" → #${channelName}`);
    
  } catch (err) {
    console.error(`[webhook] Legacy error: ${err.message}`);
    digest.push(eventType, payload, "dropped");
    recordEvent(eventType, "dropped");
  }
}

// ─── Event Handler for Polling ───────────────────────────────────────────────

/**
 * Handle events from the poller
 */
async function handlePolledEvent(eventType, payload, repo, client) {
  if (!repo.is_active) return;
  if (!repo.channel_id) return;
  
  // Check if event is muted
  if (mutes.isMuted(eventType)) {
    console.log(`[poller] "${eventType}" muted, skipping`);
    return;
  }
  
  const embed = buildEmbed(eventType, payload);
  if (!embed) return;
  
  // Add repository info
  embed.setFooter({
    text: `Repository: ${repo.full_name} (polled)`,
  });
  
  try {
    const channel = await client.channels.fetch(repo.channel_id);
    if (!channel) {
      console.error(`[poller] Channel ${repo.channel_id} not found`);
      return;
    }
    
    await channel.send({ embeds: [embed] });
    console.log(`[poller] ✉️  "${eventType}" from ${repo.full_name} → #${channel.name}`);
  } catch (err) {
    console.error(`[poller] Error: ${err.message}`);
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  createWebhookRouter,
  handlePolledEvent,
  verifySignature,
  stats,
};