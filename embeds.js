// embeds.js — formats GitHub webhook payloads into Discord embeds

const { EmbedBuilder } = require("discord.js");

// ─── Color palette ────────────────────────────────────────────────────────────

const COLORS = {
  push:           0x2ECC71, // green
  pr_open:        0x3498DB, // blue
  pr_merged:      0x9B59B6, // purple
  pr_closed:      0xE74C3C, // red
  issue_open:     0xF39C12, // orange
  issue_closed:   0x95A5A6, // grey
  release:        0xF1C40F, // yellow
  ci_pass:        0x2ECC71,
  ci_fail:        0xE74C3C,
  ci_pending:     0xF39C12,
  general:        0x5865F2, // discord blurple
};

// ─── Shared utilities ─────────────────────────────────────────────────────────

/**
 * Truncate a string to a maximum length, appending "…" if cut.
 * Returns a Discord-friendly italic placeholder for empty/null values.
 */
function truncate(str, max = 100) {
  if (!str) return "_No description_";
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

/** Markdown hyperlink for a repository. */
function repoLine(repo) {
  return `[${repo.full_name}](${repo.html_url})`;
}

/** Safe avatar URL accessor — returns null if sender is absent. */
function avatar(sender) {
  return sender?.avatar_url || null;
}

// ─── Event formatters ─────────────────────────────────────────────────────────

/**
 * push — commits pushed to a branch or tag.
 * Note: tag pushes have no `commits` array and no `compare` URL; both are
 * handled gracefully below.
 */
function formatPush(payload) {
  const { repository: repo, sender, commits, ref, compare, forced } = payload;
  const branch = ref.replace("refs/heads/", "").replace("refs/tags/", "");
  const isTag  = ref.startsWith("refs/tags/");

  const commitList = (commits || [])
    .slice(0, 5)
    .map(c =>
      `[\`${c.id.slice(0, 7)}\`](${c.url}) ${truncate(c.message.split("\n")[0], 60)} — *${c.author.name}*`
    )
    .join("\n");

  const embed = new EmbedBuilder()
    .setColor(COLORS.push)
    .setAuthor({ name: sender.login, iconURL: avatar(sender), url: sender.html_url })
    .setTitle(`${forced ? "🔄 Force pushed" : isTag ? "🏷️ Tag pushed" : "📦 Push"} to \`${branch}\``)
    .setDescription(commitList || "_No commits_")
    .addFields(
      { name: "Repo",    value: repoLine(repo),               inline: true },
      { name: "Branch",  value: `\`${branch}\``,               inline: true },
      { name: "Commits", value: String(commits?.length || 0),  inline: true }
    )
    .setTimestamp();

  // compare is null for tag pushes and single-commit pushes to new branches
  if (compare) embed.setURL(compare);

  return embed;
}

/**
 * pull_request — opened, closed, merged, reopened, review requested, etc.
 * additions/deletions are only present on opened/closed/merged; guard accordingly.
 */
function formatPullRequest(payload) {
  const { action, pull_request: pr, repository: repo, sender } = payload;

  const actionMap = {
    opened:           { label: "📬 PR Opened",        color: COLORS.pr_open   },
    closed:           { label: pr.merged ? "🔀 PR Merged" : "❌ PR Closed",
                        color: pr.merged ? COLORS.pr_merged : COLORS.pr_closed },
    reopened:         { label: "🔁 PR Reopened",       color: COLORS.pr_open   },
    review_requested: { label: "👀 Review Requested",  color: COLORS.general   },
    ready_for_review: { label: "✅ Ready for Review",  color: COLORS.pr_open   },
  };
  const { label, color } = actionMap[action] || { label: `PR ${action}`, color: COLORS.general };

  // additions/deletions are absent on review_requested, labeled, etc.
  const hasChanges = pr.additions != null && pr.deletions != null;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: sender.login, iconURL: avatar(sender), url: sender.html_url })
    .setTitle(`${label}: #${pr.number} ${truncate(pr.title, 80)}`)
    .setURL(pr.html_url)
    .setDescription(truncate(pr.body, 300))
    .addFields(
      { name: "Repo",   value: repoLine(repo),                                   inline: true },
      { name: "Branch", value: `\`${pr.head.ref}\` → \`${pr.base.ref}\``,        inline: true },
      ...(hasChanges
        ? [{ name: "Changes", value: `+${pr.additions} / -${pr.deletions}`, inline: true }]
        : []
      ),
    )
    .setTimestamp();

  return embed;
}

/**
 * issues — opened, closed, reopened, labeled, assigned, etc.
 */
function formatIssues(payload) {
  const { action, issue, repository: repo, sender } = payload;
  const isOpen = action === "opened" || action === "reopened";
  const color  = isOpen ? COLORS.issue_open : COLORS.issue_closed;
  const icon   = isOpen ? "🐛" : action === "closed" ? "✅" : "📝";

  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: sender.login, iconURL: avatar(sender), url: sender.html_url })
    .setTitle(`${icon} Issue ${action}: #${issue.number} ${truncate(issue.title, 80)}`)
    .setURL(issue.html_url)
    .setDescription(truncate(issue.body, 300))
    .addFields(
      { name: "Repo",      value: repoLine(repo),                                                  inline: true },
      { name: "Labels",    value: issue.labels?.map(l => `\`${l.name}\``).join(", ") || "_none_",  inline: true },
      { name: "Assignees", value: issue.assignees?.map(a => a.login).join(", ")      || "_none_",  inline: true }
    )
    .setTimestamp();
}

/**
 * issue_comment — new comment posted on an issue or PR.
 * Returns null for edit/delete actions (which are noisy and less actionable).
 */
function formatIssueComment(payload) {
  const { action, comment, issue, repository: repo, sender } = payload;
  if (action !== "created") return null;

  return new EmbedBuilder()
    .setColor(COLORS.general)
    .setAuthor({ name: sender.login, iconURL: avatar(sender), url: sender.html_url })
    .setTitle(`💬 Comment on Issue #${issue.number}: ${truncate(issue.title, 60)}`)
    .setURL(comment.html_url)
    .setDescription(truncate(comment.body, 300))
    .addFields({ name: "Repo", value: repoLine(repo), inline: true })
    .setTimestamp();
}

/**
 * pull_request_review — review submitted on a PR.
 * Returns null for non-submitted actions (dismissed, etc.).
 */
function formatPullRequestReview(payload) {
  const { action, review, pull_request: pr, repository: repo, sender } = payload;
  if (action !== "submitted") return null;

  const stateMap = {
    approved:          { icon: "✅", color: COLORS.ci_pass },
    changes_requested: { icon: "🔄", color: COLORS.ci_fail },
    commented:         { icon: "💬", color: COLORS.general },
  };
  const { icon, color } = stateMap[review.state] || { icon: "👁", color: COLORS.general };

  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: sender.login, iconURL: avatar(sender), url: sender.html_url })
    .setTitle(`${icon} Review on PR #${pr.number}: ${truncate(pr.title, 60)}`)
    .setURL(review.html_url)
    .setDescription(truncate(review.body, 300) || "_No comment_")
    .addFields({ name: "Repo", value: repoLine(repo), inline: true })
    .setTimestamp();
}

/**
 * create — branch or tag created.
 */
function formatCreate(payload) {
  const { ref_type, ref, repository: repo, sender } = payload;
  return new EmbedBuilder()
    .setColor(COLORS.general)
    .setAuthor({ name: sender.login, iconURL: avatar(sender), url: sender.html_url })
    .setTitle(`🌿 Created ${ref_type}: \`${ref}\``)
    .setURL(repo.html_url)
    .addFields({ name: "Repo", value: repoLine(repo), inline: true })
    .setTimestamp();
}

/**
 * delete — branch or tag deleted.
 */
function formatDelete(payload) {
  const { ref_type, ref, repository: repo, sender } = payload;
  return new EmbedBuilder()
    .setColor(COLORS.issue_closed)
    .setAuthor({ name: sender.login, iconURL: avatar(sender), url: sender.html_url })
    .setTitle(`🗑️ Deleted ${ref_type}: \`${ref}\``)
    .setURL(repo.html_url)
    .addFields({ name: "Repo", value: repoLine(repo), inline: true })
    .setTimestamp();
}

/**
 * release — published, created, edited, etc.
 */
function formatRelease(payload) {
  const { action, release, repository: repo, sender } = payload;
  return new EmbedBuilder()
    .setColor(COLORS.release)
    .setAuthor({ name: sender.login, iconURL: avatar(sender), url: sender.html_url })
    .setTitle(`🚀 Release ${action}: ${release.tag_name}`)
    .setURL(release.html_url)
    .setDescription(truncate(release.body, 400))
    .addFields(
      { name: "Repo",        value: repoLine(repo),                      inline: true },
      { name: "Pre-release", value: release.prerelease ? "Yes" : "No",  inline: true }
    )
    .setTimestamp();
}

/**
 * star — repo starred or unstarred.
 */
function formatStar(payload) {
  const { action, repository: repo, sender } = payload;
  return new EmbedBuilder()
    .setColor(COLORS.release)
    .setAuthor({ name: sender.login, iconURL: avatar(sender), url: sender.html_url })
    .setTitle(`⭐ ${sender.login} ${action === "created" ? "starred" : "unstarred"} ${repo.full_name}`)
    .setURL(repo.html_url)
    .addFields({ name: "Total Stars", value: String(repo.stargazers_count), inline: true })
    .setTimestamp();
}

/**
 * fork — repo forked.
 */
function formatFork(payload) {
  const { forkee, repository: repo, sender } = payload;
  return new EmbedBuilder()
    .setColor(COLORS.general)
    .setAuthor({ name: sender.login, iconURL: avatar(sender), url: sender.html_url })
    .setTitle(`🍴 ${sender.login} forked ${repo.full_name}`)
    .setURL(forkee.html_url)
    .addFields(
      { name: "Original", value: repoLine(repo),   inline: true },
      { name: "Fork",     value: repoLine(forkee), inline: true }
    )
    .setTimestamp();
}

/**
 * workflow_run — GitHub Actions workflow completed.
 * Returns null for non-completed actions (requested, in_progress).
 */
function formatWorkflowRun(payload) {
  const { action, workflow_run: run, repository: repo } = payload;
  if (action !== "completed") return null;

  const statusMap = {
    success:   { icon: "✅", color: COLORS.ci_pass     },
    failure:   { icon: "❌", color: COLORS.ci_fail     },
    cancelled: { icon: "🚫", color: COLORS.issue_closed },
  };
  const { icon, color } = statusMap[run.conclusion] || { icon: "🔄", color: COLORS.ci_pending };

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`${icon} Workflow: ${run.name} — ${run.conclusion}`)
    .setURL(run.html_url)
    .addFields(
      { name: "Repo",    value: repoLine(repo),           inline: true },
      { name: "Branch",  value: `\`${run.head_branch}\``, inline: true },
      { name: "Trigger", value: run.event,                inline: true }
    )
    .setTimestamp();
}

/**
 * check_run — individual CI check completed.
 * Returns null for non-completed actions, and for successful checks to reduce
 * noise (only surfaces failures and anomalies).
 */
function formatCheckRun(payload) {
  const { action, check_run: run, repository: repo } = payload;
  if (action !== "completed")      return null;
  if (run.conclusion === "success") return null; // success is intentionally silent

  const conclusionMap = {
    failure:         { icon: "❌", color: COLORS.ci_fail    },
    cancelled:       { icon: "🚫", color: COLORS.issue_closed },
    timed_out:       { icon: "⏱️", color: COLORS.ci_pending  },
    action_required: { icon: "⚠️", color: COLORS.issue_open  },
    neutral:         { icon: "➖", color: COLORS.general     },
    skipped:         { icon: "⏭️", color: COLORS.general     },
  };
  const { icon, color } = conclusionMap[run.conclusion] || { icon: "🔄", color: COLORS.ci_pending };

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`${icon} Check: ${run.name} — ${run.conclusion}`)
    .setURL(run.html_url)
    .setDescription(truncate(run.output?.summary, 200))
    .addFields(
      { name: "Repo",   value: repoLine(repo),                                              inline: true },
      { name: "Branch", value: `\`${run.check_suite?.head_branch || "unknown"}\``,          inline: true },
      { name: "App",    value: run.app?.name || "_unknown_",                                inline: true }
    )
    .setTimestamp();
}

/**
 * deployment_status — deployment reached a terminal or notable state.
 */
function formatDeploymentStatus(payload) {
  const { deployment_status: status, deployment, repository: repo, sender } = payload;

  const stateMap = {
    success:  { icon: "🚀", color: COLORS.ci_pass     },
    failure:  { icon: "💥", color: COLORS.ci_fail     },
    error:    { icon: "❌", color: COLORS.ci_fail     },
    pending:  { icon: "⏳", color: COLORS.ci_pending  },
    inactive: { icon: "💤", color: COLORS.general     },
  };
  const { icon, color } = stateMap[status.state] || { icon: "🔄", color: COLORS.general };

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${icon} Deployment ${status.state}: ${deployment.environment}`)
    .setURL(status.target_url || repo.html_url)
    .setDescription(truncate(status.description, 200))
    .addFields(
      { name: "Repo",        value: repoLine(repo),                  inline: true },
      { name: "Environment", value: `\`${deployment.environment}\``, inline: true },
      { name: "Ref",         value: `\`${deployment.ref}\``,         inline: true }
    )
    .setTimestamp();

  // sender is not always present on deployment_status events
  if (sender) embed.setAuthor({ name: sender.login, iconURL: avatar(sender), url: sender.html_url });

  return embed;
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

/**
 * Build a Discord EmbedBuilder for a given GitHub event + payload.
 *
 * @param {string} eventType  Value of the X-GitHub-Event header
 * @param {object} payload    Parsed webhook JSON body
 * @returns {EmbedBuilder|null}  null means "nothing to post for this action"
 */
function buildEmbed(eventType, payload) {
  try {
    switch (eventType) {
      case "push":                return formatPush(payload);
      case "pull_request":        return formatPullRequest(payload);
      case "issues":              return formatIssues(payload);
      case "issue_comment":       return formatIssueComment(payload);
      case "pull_request_review": return formatPullRequestReview(payload);
      case "create":              return formatCreate(payload);
      case "delete":              return formatDelete(payload);
      case "release":             return formatRelease(payload);
      case "star":                return formatStar(payload);
      case "fork":                return formatFork(payload);
      case "workflow_run":        return formatWorkflowRun(payload);
      case "check_run":           return formatCheckRun(payload);
      case "deployment_status":   return formatDeploymentStatus(payload);
      default:
        // Unrecognised event — caller will log and ignore
        return null;
    }
  } catch (err) {
    console.error(`[embeds] Failed to build embed for "${eventType}":`, err.message);
    return null;
  }
}

module.exports = { buildEmbed };