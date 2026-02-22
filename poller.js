// poller.js — GitHub API polling system for repositories without webhooks
// Handles rate limiting, error handling, and event detection

"use strict";

const https   = require("https");
const http    = require("http");

// ─── Rate Limiting ────────────────────────────────────────────────────────────

// Global rate limit tracking
const rateLimits = new Map();

/**
 * Check if we're rate limited for a specific token
 */
function isRateLimited(tokenId) {
  const limit = rateLimits.get(tokenId);
  if (!limit) return false;
  return Date.now() < limit.resetTime;
}

/**
 * Get remaining requests for a token
 */
function getRemainingRequests(tokenId) {
  const limit = rateLimits.get(tokenId);
  return limit ? limit.remaining : 5000;
}

/**
 * Update rate limit info from GitHub API response headers
 */
function updateRateLimit(tokenId, headers) {
  const remaining = parseInt(headers["x-ratelimit-remaining"] || "5000", 10);
  const reset     = parseInt(headers["x-ratelimit-reset"] || "0", 10) * 1000; // Convert to ms
  
  rateLimits.set(tokenId, { remaining, resetTime: reset });
  
  // Log rate limit status
  if (remaining < 100) {
    console.warn(`[poller] Rate limit low for token ${tokenId}: ${remaining} remaining, resets at ${new Date(reset).toISOString()}`);
  }
  
  return { remaining, resetTime: reset };
}

// ─── HTTP Helpers ────────────────────────────────────────────────────────────

/**
 * Make an HTTP request to GitHub API
 */
function githubRequest(method, path, token, body = null) {
  return new Promise((resolve, reject) => {
    const isHttps = !process.env.GITHUB_API_URL?.startsWith("http://");
    const baseUrl = process.env.GITHUB_API_URL || "api.github.com";
    const protocol = isHttps ? https : http;
    
    const options = {
      hostname: baseUrl.replace(/^https?:\/\//, ""),
      port:     isHttps ? 443 : 80,
      path:     `/repos${path}`,
      method:   method,
      headers:  {
        "Accept":               "application/vnd.github+json",
        "Authorization":        `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent":           "GitBot-Discord/2.0",
      },
    };
    
    if (body) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    
    const req = protocol.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        // Update rate limit info
        updateRateLimit(token, res.headers);
        
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(data ? JSON.parse(data) : null);
          } catch {
            resolve(data);
          }
        } else if (res.statusCode === 404) {
          reject({ status: 404, message: "Repository not found or is private" });
        } else if (res.statusCode === 403) {
          reject({ status: 403, message: "Forbidden - possibly rate limited" });
        } else if (res.statusCode === 401) {
          reject({ status: 401, message: "Unauthorized - check your token" });
        } else {
          reject({ status: res.statusCode, message: data || "Unknown error" });
        }
      });
    });
    
    req.on("error", reject);
    
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Polling Functions ────────────────────────────────────────────────────────

/**
 * Get the latest commit SHA for a repository
 */
async function getLatestCommit(owner, name, token) {
  try {
    const data = await githubRequest("GET", `/${owner}/${name}/commits?per_page=1`, token);
    if (data && data.length > 0) {
      return data[0].sha;
    }
    return null;
  } catch (err) {
    throw err;
  }
}

/**
 * Get recent commits since a specific SHA
 */
async function getCommitsSince(owner, name, token, sinceSha) {
  try {
    // Get commits up to 30 to check for the SHA
    const data = await githubRequest("GET", `/${owner}/${name}/commits?per_page=30`, token);
    if (!data || data.length === 0) return [];
    
    // Find commits after the known SHA
    const commits = [];
    let found = false;
    
    for (const commit of data) {
      if (commit.sha === sinceSha) {
        found = true;
        break;
      }
      commits.push(commit);
    }
    
    // If we didn't find the SHA, return the most recent ones (up to 5)
    if (!found && data.length > 0) {
      return data.slice(0, 5);
    }
    
    return commits;
  } catch (err) {
    throw err;
  }
}

/**
 * Get recent releases
 */
async function getRecentReleases(owner, name, token, beforeTag = null) {
  try {
    const data = await githubRequest("GET", `/${owner}/${name}/releases?per_page=5`, token);
    if (!data || data.length === 0) return [];
    
    if (!beforeTag) return data;
    
    // Filter releases before the known one
    return data.filter(r => r.tag_name !== beforeTag);
  } catch (err) {
    throw err;
  }
}

/**
 * Get recent pull requests
 */
async function getRecentPullRequests(owner, name, token, since = null) {
  try {
    let url = `/${owner}/${name}/pulls?state=all&per_page=10`;
    if (since) {
      // GitHub API doesn't support filtering by date directly for PRs
      // We'll get all and filter client-side
    }
    const data = await githubRequest("GET", url, token);
    return data || [];
  } catch (err) {
    throw err;
  }
}

/**
 * Get repository info
 */
async function getRepoInfo(owner, name, token) {
  try {
    return await githubRequest("GET", `/${owner}/${name}`, token);
  } catch (err) {
    throw err;
  }
}

// ─── Poller Class ────────────────────────────────────────────────────────────

class GitHubPoller {
  constructor(options = {}) {
    this.interval = options.interval || 60000; // Default 1 minute
    this.onEvent = options.onEvent || (() => {});
    this.timer = null;
    this.running = false;
  }
  
  /**
   * Start polling
   */
  start() {
    if (this.running) return;
    this.running = true;
    this._poll();
    this.timer = setInterval(() => this._poll(), this.interval);
    console.log(`[poller] Started polling every ${this.interval / 1000}s`);
  }
  
  /**
   * Stop polling
   */
  stop() {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log("[poller] Stopped polling");
  }
  
  /**
   * Set polling interval
   */
  setInterval(ms) {
    this.interval = ms;
    if (this.running) {
      this.stop();
      this.start();
    }
  }
  
  /**
   * Poll all enabled repositories
   */
  async _poll() {
    const db = require("./database");
    
    try {
      const repos = db.getPollableRepositories();
      
      if (repos.length === 0) {
        return;
      }
      
      for (const repo of repos) {
        await this._pollRepo(repo);
      }
    } catch (err) {
      console.error("[poller] Polling error:", err.message);
    }
  }
  
  /**
   * Poll a single repository
   */
  async _pollRepo(repo) {
    const db = require("./database");
    
    // Get token for this repo
    let token = null;
    if (repo.github_token_id) {
      const tokenObj = db.getTokenById(repo.github_token_id);
      token = tokenObj?.token;
    }
    
    // Fall back to default token
    if (!token) {
      const defaultToken = db.getDefaultToken();
      token = defaultToken?.token;
    }
    
    if (!token) {
      console.warn(`[poller] No token for ${repo.full_name}`);
      return;
    }
    
    // Check rate limit
    const tokenId = repo.github_token_id || db.getDefaultToken()?.id;
    if (tokenId && isRateLimited(tokenId)) {
      console.log(`[poller] Rate limited, skipping ${repo.full_name}`);
      return;
    }
    
    try {
      // Check for new commits
      const latestSha = await getLatestCommit(repo.owner, repo.name, token);
      
      if (!latestSha) {
        return;
      }
      
      // First time seeing this repo
      if (!repo.last_commit_sha) {
        db.updateRepository(repo.id, {
          last_commit_sha: latestSha,
          last_polled_at: Date.now(),
          error_message: null,
        });
        console.log(`[poller] Initialized polling for ${repo.full_name} at ${latestSha.slice(0, 7)}`);
        return;
      }
      
      // Check if there are new commits
      if (latestSha !== repo.last_commit_sha) {
        const newCommits = await getCommitsSince(repo.owner, repo.name, token, repo.last_commit_sha);
        
        if (newCommits.length > 0) {
          console.log(`[poller] ${newCommits.length} new commit(s) for ${repo.full_name}`);
          
          // Build a synthetic push event for each new commit (up to 5)
          for (const commit of newCommits.slice(0, 5)) {
            const payload = {
              repository: {
                full_name: repo.full_name,
                html_url: `https://github.com/${repo.full_name}`,
                owner: { login: repo.owner },
                name: repo.name,
              },
              sender: {
                login: commit.author?.login || commit.commit.author.name,
                html_url: commit.author?.html_url || null,
              },
              commits: [commit],
              ref: `refs/heads/main`,
              compare: `https://github.com/${repo.full_name}/compare/${repo.last_commit_sha}...${latestSha}`,
            };
            
            this.onEvent("push", payload, repo);
          }
          
          // Update last known SHA
          db.updateRepository(repo.id, {
            last_commit_sha: latestSha,
            last_polled_at: Date.now(),
            error_message: null,
          });
        }
      } else {
        // Just update polling time
        db.updateRepository(repo.id, {
          last_polled_at: Date.now(),
        });
      }
      
    } catch (err) {
      console.error(`[poller] Error polling ${repo.full_name}:`, err.message);
      
      // Mark the repo with error
      db.updateRepository(repo.id, {
        error_message: err.message,
      });
    }
  }
  
  /**
   * Manually trigger a poll for a specific repo
   */
  async pollNow(repoFullName) {
    const db = require("./database");
    const repo = db.getRepositoryByFullName(repoFullName);
    
    if (!repo) {
      throw new Error(`Repository ${repoFullName} not found`);
    }
    
    if (!repo.poll_enabled) {
      throw new Error(`Repository ${repoFullName} is not enabled for polling`);
    }
    
    await this._pollRepo(repo);
  }
}

module.exports = {
  GitHubPoller,
  githubRequest,
  isRateLimited,
  getRemainingRequests,
  updateRateLimit,
  getLatestCommit,
  getCommitsSince,
  getRecentReleases,
  getRecentPullRequests,
  getRepoInfo,
};
