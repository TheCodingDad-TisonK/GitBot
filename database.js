// database.js — SQLite database for multi-repo support
// Stores repositories, users, settings, and rate limit data

"use strict";

const path    = require("path");
const fs     = require("fs");
const dbPath = path.join(__dirname, "gitbot.db");

// Use better-sqlite3 for sync operations (faster, simpler)
let Database;
try {
  Database = require("better-sqlite3");
} catch {
  console.warn("[db] better-sqlite3 not found, using sqlite3 (async)");
  Database = require("sqlite3").verbose();
}

let db;

/**
 * Initialize database and create tables
 */
function init() {
  // Use synchronous better-sqlite3 if available, otherwise wrap sqlite3
  const useSync = !!(require.cache[require.resolve("better-sqlite3")]);
  
  if (useSync) {
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    _createTablesSync();
  } else {
    // For sqlite3, we'll use a Promise-based approach
    return new Promise((resolve, reject) => {
      db = new Database(dbPath, err => {
        if (err) return reject(err);
        db.run("PRAGMA journal_mode = WAL", () => {
          _createTablesAsync(() => resolve());
        });
      });
    });
  }
}

function _createTablesSync() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS repositories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      full_name TEXT UNIQUE NOT NULL,
      channel_id TEXT,
      webhook_secret TEXT,
      webhook_id TEXT,
      github_token_id TEXT,
      poll_enabled INTEGER DEFAULT 0,
      last_commit_sha TEXT,
      last_polled_at INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT,
      is_active INTEGER DEFAULT 1,
      error_message TEXT,
      UNIQUE(owner, name)
    );

    CREATE TABLE IF NOT EXISTS github_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL,
      user_id TEXT,
      description TEXT,
      rate_limit_remaining INTEGER DEFAULT 5000,
      rate_limit_reset INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      is_default INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_user_id TEXT UNIQUE NOT NULL,
      username TEXT,
      added_at TEXT DEFAULT CURRENT_TIMESTAMP,
      added_by TEXT
    );

    CREATE TABLE IF NOT EXISTS repo_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT,
      processed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (repo_id) REFERENCES repositories(id)
    );

    CREATE INDEX IF NOT EXISTS idx_repos_full_name ON repositories(full_name);
    CREATE INDEX IF NOT EXISTS idx_repos_active ON repositories(is_active);
    CREATE INDEX IF NOT EXISTS idx_tokens_default ON github_tokens(is_default);
  `);
  console.log("[db] Database initialized (sync)");
}

function _createTablesAsync(callback) {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS repositories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner TEXT NOT NULL,
        name TEXT NOT NULL,
        full_name TEXT UNIQUE NOT NULL,
        channel_id TEXT,
        webhook_secret TEXT,
        webhook_id TEXT,
        github_token_id TEXT,
        poll_enabled INTEGER DEFAULT 0,
        last_commit_sha TEXT,
        last_polled_at INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT,
        is_active INTEGER DEFAULT 1,
        error_message TEXT,
        UNIQUE(owner, name)
      )
    `, () => {
      db.run(`CREATE TABLE IF NOT EXISTS github_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT NOT NULL,
        user_id TEXT,
        description TEXT,
        rate_limit_remaining INTEGER DEFAULT 5000,
        rate_limit_reset INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        is_default INTEGER DEFAULT 0
      )`, () => {
        db.run(`CREATE TABLE IF NOT EXISTS admins (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          discord_user_id TEXT UNIQUE NOT NULL,
          username TEXT,
          added_at TEXT DEFAULT CURRENT_TIMESTAMP,
          added_by TEXT
        )`, () => {
          db.run(`CREATE TABLE IF NOT EXISTS repo_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_id INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            payload TEXT,
            processed INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (repo_id) REFERENCES repositories(id)
          )`, callback);
        });
      });
    });
  });
}

// ─── Repository Operations ───────────────────────────────────────────────────

/**
 * Add a new repository to monitor
 * @param {string} owner - Repository owner
 * @param {string} name - Repository name
 * @param {string} channelId - Discord channel ID for notifications
 * @param {string} createdBy - Discord user ID who added the repo
 * @param {object} options - Optional: tokenId, webhookSecret, pollEnabled
 * @returns {object} The created repository
 */
function addRepository(owner, name, channelId, createdBy, options = {}) {
  const fullName = `${owner}/${name}`;
  
  if (db.constructor.name === "Database") {
    // Sync mode (better-sqlite3)
    const stmt = db.prepare(`
      INSERT INTO repositories (owner, name, full_name, channel_id, created_by, github_token_id, webhook_secret, poll_enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    try {
      const result = stmt.run(
        owner, name, fullName, channelId, createdBy,
        options.tokenId || null,
        options.webhookSecret || null,
        options.pollEnabled ? 1 : 0
      );
      return getRepositoryById(result.lastInsertRowid);
    } catch (err) {
      if (err.message.includes("UNIQUE constraint")) {
        throw new Error(`Repository ${fullName} is already registered`);
      }
      throw err;
    }
  } else {
    // Async mode - return promise
    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO repositories (owner, name, full_name, channel_id, created_by, github_token_id, webhook_secret, poll_enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        owner, name, fullName, channelId, createdBy,
        options.tokenId || null,
        options.webhookSecret || null,
        options.pollEnabled ? 1 : 0,
        function(err) {
          if (err) {
            if (err.message.includes("UNIQUE constraint")) {
              return reject(new Error(`Repository ${fullName} is already registered`));
            }
            return reject(err);
          }
          resolve(getRepositoryByIdSync(this.lastID));
        }
      );
    });
  }
}

/**
 * Get repository by ID (sync)
 */
function getRepositoryById(id) {
  const stmt = db.prepare("SELECT * FROM repositories WHERE id = ?");
  return stmt.get(id);
}

function getRepositoryByIdSync(id) {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM repositories WHERE id = ?", [id], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

/**
 * Get repository by full_name (owner/name)
 */
function getRepositoryByFullName(fullName) {
  if (db.constructor.name === "Database") {
    const stmt = db.prepare("SELECT * FROM repositories WHERE full_name = ?");
    return stmt.get(fullName);
  } else {
    return new Promise((resolve, reject) => {
      db.get("SELECT * FROM repositories WHERE full_name = ?", [fullName], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  }
}

/**
 * Get all active repositories
 */
function getAllRepositories() {
  if (db.constructor.name === "Database") {
    const stmt = db.prepare("SELECT * FROM repositories WHERE is_active = 1 ORDER BY full_name");
    return stmt.all();
  } else {
    return new Promise((resolve, reject) => {
      db.all("SELECT * FROM repositories WHERE is_active = 1 ORDER BY full_name", (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }
}

/**
 * Get all repositories that have polling enabled
 */
function getPollableRepositories() {
  if (db.constructor.name === "Database") {
    const stmt = db.prepare("SELECT * FROM repositories WHERE is_active = 1 AND poll_enabled = 1");
    return stmt.all();
  } else {
    return new Promise((resolve, reject) => {
      db.all("SELECT * FROM repositories WHERE is_active = 1 AND poll_enabled = 1", (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }
}

/**
 * Update repository settings
 */
function updateRepository(id, updates) {
  const allowed = ["channel_id", "webhook_secret", "github_token_id", "poll_enabled", "last_commit_sha", "last_polled_at", "is_active", "error_message"];
  const fields = [];
  const values = [];
  
  for (const [key, value] of Object.entries(updates)) {
    if (allowed.includes(key)) {
      fields.push(`${key} = ?`);
      values.push(key === "poll_enabled" || key === "is_active" ? (value ? 1 : 0) : value);
    }
  }
  
  if (fields.length === 0) return;
  
  values.push(id);
  
  if (db.constructor.name === "Database") {
    const stmt = db.prepare(`UPDATE repositories SET ${fields.join(", ")} WHERE id = ?`);
    stmt.run(...values);
  } else {
    return new Promise((resolve, reject) => {
      db.run(`UPDATE repositories SET ${fields.join(", ")} WHERE id = ?`, values, err => {
        if (err) return reject(err);
        resolve();
      });
    });
  }
}

/**
 * Remove a repository
 */
function removeRepository(idOrFullName) {
  const isNumeric = /^\d+$/.test(String(idOrFullName));
  const where = isNumeric ? "id = ?" : "full_name = ?";
  
  if (db.constructor.name === "Database") {
    const stmt = db.prepare(`UPDATE repositories SET is_active = 0 WHERE ${where}`);
    return stmt.run(idOrFullName);
  } else {
    return new Promise((resolve, reject) => {
      db.run(`UPDATE repositories SET is_active = 0 WHERE ${where}`, [idOrFullName], err => {
        if (err) return reject(err);
        resolve();
      });
    });
  }
}

/**
 * Hard delete a repository
 */
function deleteRepository(idOrFullName) {
  const isNumeric = /^\d+$/.test(String(idOrFullName));
  const where = isNumeric ? "id = ?" : "full_name = ?";
  
  if (db.constructor.name === "Database") {
    const stmt = db.prepare(`DELETE FROM repositories WHERE ${where}`);
    return stmt.run(idOrFullName);
  } else {
    return new Promise((resolve, reject) => {
      db.run(`DELETE FROM repositories WHERE ${where}`, [idOrFullName], err => {
        if (err) return reject(err);
        resolve();
      });
    });
  }
}

// ─── Admin Operations ─────────────────────────────────────────────────────────

/**
 * Add an admin
 */
function addAdmin(discordUserId, username, addedBy) {
  if (db.constructor.name === "Database") {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO admins (discord_user_id, username, added_by)
      VALUES (?, ?, ?)
    `);
    return stmt.run(discordUserId, username, addedBy);
  } else {
    return new Promise((resolve, reject) => {
      db.run(`INSERT OR IGNORE INTO admins (discord_user_id, username, added_by) VALUES (?, ?, ?)`,
        [discordUserId, username, addedBy], err => {
          if (err) return reject(err);
          resolve();
        });
    });
  }
}

/**
 * Remove an admin
 */
function removeAdmin(discordUserId) {
  if (db.constructor.name === "Database") {
    const stmt = db.prepare("DELETE FROM admins WHERE discord_user_id = ?");
    return stmt.run(discordUserId);
  } else {
    return new Promise((resolve, reject) => {
      db.run("DELETE FROM admins WHERE discord_user_id = ?", [discordUserId], err => {
        if (err) return reject(err);
        resolve();
      });
    });
  }
}

/**
 * Check if user is an admin
 */
function isAdmin(discordUserId) {
  if (db.constructor.name === "Database") {
    const stmt = db.prepare("SELECT 1 FROM admins WHERE discord_user_id = ?");
    return !!stmt.get(discordUserId);
  } else {
    return new Promise((resolve, reject) => {
      db.get("SELECT 1 FROM admins WHERE discord_user_id = ?", [discordUserId], (err, row) => {
        if (err) return reject(err);
        resolve(!!row);
      });
    });
  }
}

/**
 * Get all admins
 */
function getAllAdmins() {
  if (db.constructor.name === "Database") {
    const stmt = db.prepare("SELECT * FROM admins ORDER BY username");
    return stmt.all();
  } else {
    return new Promise((resolve, reject) => {
      db.all("SELECT * FROM admins ORDER BY username", (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }
}

// ─── GitHub Token Operations ──────────────────────────────────────────────────

/**
 * Add a GitHub token
 */
function addToken(token, userId, description, isDefault = false) {
  if (isDefault) {
    // Unset other defaults first
    if (db.constructor.name === "Database") {
      db.prepare("UPDATE github_tokens SET is_default = 0").run();
    } else {
      db.run("UPDATE github_tokens SET is_default = 0");
    }
  }
  
  if (db.constructor.name === "Database") {
    const stmt = db.prepare(`
      INSERT INTO github_tokens (token, user_id, description, is_default)
      VALUES (?, ?, ?, ?)
    `);
    return stmt.run(token, userId, description, isDefault ? 1 : 0);
  } else {
    return new Promise((resolve, reject) => {
      db.run(`INSERT INTO github_tokens (token, user_id, description, is_default) VALUES (?, ?, ?, ?)`,
        [token, userId, description, isDefault ? 1 : 0], err => {
          if (err) return reject(err);
          resolve();
        });
    });
  }
}

/**
 * Get the default token
 */
function getDefaultToken() {
  if (db.constructor.name === "Database") {
    const stmt = db.prepare("SELECT * FROM github_tokens WHERE is_default = 1 LIMIT 1");
    return stmt.get();
  } else {
    return new Promise((resolve, reject) => {
      db.get("SELECT * FROM github_tokens WHERE is_default = 1 LIMIT 1", (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  }
}

/**
 * Get token by ID
 */
function getTokenById(id) {
  if (db.constructor.name === "Database") {
    const stmt = db.prepare("SELECT * FROM github_tokens WHERE id = ?");
    return stmt.get(id);
  } else {
    return new Promise((resolve, reject) => {
      db.get("SELECT * FROM github_tokens WHERE id = ?", [id], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  }
}

/**
 * Update token rate limit info
 */
function updateTokenRateLimit(tokenId, remaining, resetTime) {
  if (db.constructor.name === "Database") {
    const stmt = db.prepare("UPDATE github_tokens SET rate_limit_remaining = ?, rate_limit_reset = ? WHERE id = ?");
    return stmt.run(remaining, resetTime, tokenId);
  } else {
    return new Promise((resolve, reject) => {
      db.run("UPDATE github_tokens SET rate_limit_remaining = ?, rate_limit_reset = ? WHERE id = ?",
        [remaining, resetTime, tokenId], err => {
          if (err) return reject(err);
          resolve();
        });
    });
  }
}

/**
 * Get all tokens
 */
function getAllTokens() {
  if (db.constructor.name === "Database") {
    const stmt = db.prepare("SELECT id, user_id, description, rate_limit_remaining, rate_limit_reset, created_at, is_default FROM github_tokens");
    return stmt.all();
  } else {
    return new Promise((resolve, reject) => {
      db.all("SELECT id, user_id, description, rate_limit_remaining, rate_limit_reset, created_at, is_default FROM github_tokens",
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        });
    });
  }
}

/**
 * Remove a token
 */
function removeToken(id) {
  if (db.constructor.name === "Database") {
    const stmt = db.prepare("DELETE FROM github_tokens WHERE id = ?");
    return stmt.run(id);
  } else {
    return new Promise((resolve, reject) => {
      db.run("DELETE FROM github_tokens WHERE id = ?", [id], err => {
        if (err) return reject(err);
        resolve();
      });
    });
  }
}

module.exports = {
  init,
  // Repository operations
  addRepository,
  getRepositoryById,
  getRepositoryByFullName,
  getAllRepositories,
  getPollableRepositories,
  updateRepository,
  removeRepository,
  deleteRepository,
  // Admin operations
  addAdmin,
  removeAdmin,
  isAdmin,
  getAllAdmins,
  // Token operations
  addToken,
  getDefaultToken,
  getTokenById,
  updateTokenRateLimit,
  getAllTokens,
  removeToken,
};
