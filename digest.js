// digest.js — in-memory ring buffer of recent GitHub events
// Stores the last MAX_ENTRIES events. Consumed by /digest.
// Resets on bot restart (no persistence needed — this is a live feed helper).

"use strict";

const MAX_ENTRIES = 50;

/** @type {DigestEntry[]} */
const _ring = [];

/**
 * @typedef {Object} DigestEntry
 * @property {string}  eventType
 * @property {string}  summary     — human-readable one-liner
 * @property {string|null} url     — link to the GitHub object
 * @property {string|null} actor   — GitHub username
 * @property {string|null} repo    — full_name e.g. "owner/repo"
 * @property {Date}    timestamp
 * @property {'sent'|'dropped'|'ignored'} outcome
 */

/**
 * Push a new event into the ring buffer.
 * @param {string} eventType
 * @param {object} payload      Raw webhook payload
 * @param {'sent'|'dropped'|'ignored'} outcome
 */
function push(eventType, payload, outcome) {
  const entry = {
    eventType,
    outcome,
    timestamp: new Date(),
    actor:   payload?.sender?.login         || null,
    repo:    payload?.repository?.full_name || null,
    summary: _summarise(eventType, payload),
    url:     _url(eventType, payload),
  };

  _ring.push(entry);
  if (_ring.length > MAX_ENTRIES) _ring.shift();
}

/**
 * Return the most recent `limit` entries, newest last.
 * @param {number} [limit=10]
 * @returns {DigestEntry[]}
 */
function recent(limit = 10) {
  return _ring.slice(-Math.min(limit, MAX_ENTRIES));
}

/** Total entries currently in the ring. */
function size() { return _ring.length; }

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _clip(str, max = 55) {
  if (!str) return "";
  const s = str.replace(/\r?\n/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function _summarise(type, p) {
  try {
    const who = p?.sender?.login || "someone";
    switch (type) {
      case "push":
        return `${who} pushed ${p.commits?.length ?? 0} commit(s) to \`${p.ref?.replace("refs/heads/","")}\``;
      case "pull_request":
        return `${who} ${p.action} PR #${p.pull_request?.number}: ${_clip(p.pull_request?.title)}`;
      case "issues":
        return `${who} ${p.action} issue #${p.issue?.number}: ${_clip(p.issue?.title)}`;
      case "issue_comment":
        return `${who} commented on #${p.issue?.number}: ${_clip(p.comment?.body)}`;
      case "pull_request_review":
        return `${who} reviewed PR #${p.pull_request?.number} (${p.review?.state})`;
      case "release":
        return `${who} ${p.action} release ${p.release?.tag_name}`;
      case "star":
        return `${who} ${p.action === "created" ? "⭐ starred" : "unstarred"} the repo (${p.repository?.stargazers_count} total)`;
      case "fork":
        return `${who} 🍴 forked → ${p.forkee?.full_name}`;
      case "create":
        return `${who} created ${p.ref_type} \`${p.ref}\``;
      case "delete":
        return `${who} deleted ${p.ref_type} \`${p.ref}\``;
      case "workflow_run":
        return `Workflow "${p.workflow_run?.name}" ${p.workflow_run?.conclusion || p.action} on \`${p.workflow_run?.head_branch}\``;
      case "check_run":
        return `Check "${p.check_run?.name}" → ${p.check_run?.conclusion || p.action}`;
      case "deployment_status":
        return `Deploy to \`${p.deployment?.environment}\` → ${p.deployment_status?.state}`;
      default:
        return `${type}${p?.action ? ` (${p.action})` : ""}`;
    }
  } catch {
    return type;
  }
}

function _url(type, p) {
  try {
    switch (type) {
      case "push":                return p?.compare || p?.repository?.html_url;
      case "pull_request":        return p?.pull_request?.html_url;
      case "issues":              return p?.issue?.html_url;
      case "issue_comment":       return p?.comment?.html_url;
      case "pull_request_review": return p?.review?.html_url;
      case "release":             return p?.release?.html_url;
      case "workflow_run":        return p?.workflow_run?.html_url;
      case "check_run":           return p?.check_run?.html_url;
      case "deployment_status":   return p?.deployment_status?.target_url || p?.repository?.html_url;
      default:                    return p?.repository?.html_url || null;
    }
  } catch {
    return null;
  }
}

module.exports = { push, recent, size };
