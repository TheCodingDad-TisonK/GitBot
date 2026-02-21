// mutes.js — in-memory event-type mute store
// Muted events are still received and logged but NOT forwarded to Discord channels.
// Mutes are per-event-type and expire after a configurable duration.
// Resets on restart.

"use strict";

/**
 * @typedef {Object} MuteEntry
 * @property {string}  eventType
 * @property {Date}    expiresAt
 * @property {string}  mutedBy    — Discord user ID
 * @property {string}  reason     — optional reason string
 */

/** @type {Map<string, MuteEntry>} */
const _mutes = new Map();

/**
 * Mute an event type for a duration.
 * @param {string} eventType
 * @param {number} durationMs
 * @param {string} mutedBy      Discord user ID
 * @param {string} [reason]
 * @returns {MuteEntry}
 */
function mute(eventType, durationMs, mutedBy, reason = "") {
  const entry = {
    eventType,
    expiresAt: new Date(Date.now() + durationMs),
    mutedBy,
    reason,
  };
  _mutes.set(eventType, entry);
  return entry;
}

/**
 * Remove a mute early.
 * @param {string} eventType
 * @returns {boolean} true if a mute was removed
 */
function unmute(eventType) {
  return _mutes.delete(eventType);
}

/**
 * Is this event type currently muted?
 * Auto-cleans expired entries.
 * @param {string} eventType
 * @returns {boolean}
 */
function isMuted(eventType) {
  const entry = _mutes.get(eventType);
  if (!entry) return false;
  if (Date.now() >= entry.expiresAt.getTime()) {
    _mutes.delete(eventType);
    return false;
  }
  return true;
}

/**
 * Get the active mute entry for an event type, or null.
 * @param {string} eventType
 * @returns {MuteEntry|null}
 */
function getMute(eventType) {
  if (!isMuted(eventType)) return null;
  return _mutes.get(eventType) || null;
}

/**
 * List all currently active mutes (expired ones are pruned).
 * @returns {MuteEntry[]}
 */
function list() {
  const now = Date.now();
  const active = [];
  for (const [key, entry] of _mutes) {
    if (now >= entry.expiresAt.getTime()) {
      _mutes.delete(key);
    } else {
      active.push(entry);
    }
  }
  return active;
}

module.exports = { mute, unmute, isMuted, getMute, list };
