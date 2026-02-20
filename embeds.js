// embeds.js — formats GitHub webhook payloads into Discord embeds

const { EmbedBuilder } = require("discord.js");

// Color palette
const COLORS = {
  push:        0x2ECC71, // green
  pr_open:     0x3498DB, // blue
  pr_merged:   0x9B59B6, // purple
  pr_closed:   0xE74C3C, // red
  issue_open:  0xF39C12, // orange
  issue_closed:0x95A5A6, // grey
  release:     0xF1C40F, // yellow
  ci_pass:     0x2ECC71,
  ci_fail:     0xE74C3C,
  ci_pending:  0xF39C12,
  general:     0x5865F2, // discord blurple
};

function truncate(str, max = 100) {
  if (!str) return "_No description_";
  return str.length > max ? str.slice(0, max - 3) + "..." : str;
}

function repoLine(repo) {
  return `[${repo.full_name}](${repo.html_url})`;
}

function avatar(sender) {
  return sender?.avatar_url || null;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatPush(payload) {
  const { repository: repo, sender, commits, ref, compare, forced } = payload;
  const branch = ref.replace("refs/heads/", "");
  const commitList = (commits || [])
    .slice(0, 5)
    .map(c => `[\`${c.id.slice(0,7)}\`](${c.url}) ${truncate(c.message.split("\n")[0], 60)} — *${c.author.name}*`)
    .join("\n");

  return new EmbedBuilder()
    .setColor(COLORS.push)
    .setAuthor({ name: sender.login, iconURL: avatar(sender), url: sender.html_url })
  .setTitle(`${forced ? "🔄 Force pushed" : "📦 Push"} to \`${branch}\``)
    .setURL(compare)
    .setDescription(commitList || "_No commits_")
    .addFields(
      { name: "Repo", value: repoLine(repo), inline: true },
      { name: "Branch", value: `\`${branch}\``, inline: true },
      { name: "Commits", value: String(commits?.length || 0), inline: true }
    )
    .setTimestamp();
}

function formatPullRequest(payload) {
  const { action, pull_request: pr, repository: repo, sender } = payload;
  const actionMap = {
    opened:      { label: "📬 PR Opened",       color: COLORS.pr_open },
    closed:      { label: pr.merged ? "🔀 PR Merged" : "❌ PR Closed", color: pr.merged ? COLORS.pr_merged : COLORS.pr_closed },
    reopened:    { label: "🔁 PR Reopened",     color: COLORS.pr_open },
    review_requested: { label: "👀 Review Requested", color: COLORS.general },
    ready_for_review: { label: "✅ Ready for Review", color: COLORS.pr_open },
  };
  const { label, color } = actionMap[action] || { label: `PR ${action}`, color: COLORS.general };

  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: sender.login, iconURL: avatar(sender), url: sender.html_url })
    .setTitle(`${label}: #${pr.number} ${truncate(pr.title, 80)}`)
    .setURL(pr.html_url)
    .setDescription(truncate(pr.body, 300))
    .addFields(
      { name: "Repo", value: repoLine(repo), inline: true },
      { name: "Branch", value: `\`${pr.head.ref}\` → \`${pr.base.ref}\``, inline: true },
      { name: "Changes", value: `+${pr.additions} / -${pr.deletions}`, inline: true }
    )
    .setTimestamp();
}

function formatIssues(payload) {
  const { action, issue, repository: repo, sender } = payload;
  const isOpen = action === "opened" || action === "reopened";
  const color = isOpen ? COLORS.issue_open : COLORS.issue_closed;
  const icon = isOpen ? "🐛" : action === "closed" ? "✅" : "📝";

  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: sender.login, iconURL: avatar(sender), url: sender.html_url })
    .setTitle(`${icon} Issue ${action}: #${issue.number} ${truncate(issue.title, 80)}`)
    .setURL(issue.html_url)
    .setDescription(truncate(issue.body, 300))
    .addFields(
      { name: "Repo", value: repoLine(repo), inline: true },
      { name: "Labels", value: issue.labels?.map(l => `\`${l.name}\``).join(", ") || "_none_", inline: true },
      { name: "Assignees", value: issue.assignees?.map(a => a.login).join(", ") || "_none_", inline: true }
    )
    .setTimestamp();
}

function formatIssueComment(payload) {
  const { action, comment, issue, repository: repo, sender } = payload;
  if (action !== "created") return null; // only show new comments

  return new EmbedBuilder()
    .setColor(COLORS.general)
    .setAuthor({ name: sender.login, iconURL: avatar(sender), url: sender.html_url })
    .setTitle(`💬 Comment on Issue #${issue.number}: ${truncate(issue.title, 60)}`)
    .setURL(comment.html_url)
    .setDescription(truncate(comment.body, 300))
    .addFields({ name: "Repo", value: repoLine(repo), inline: true })
    .setTimestamp();
}

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

function formatRelease(payload) {
  const { action, release, repository: repo, sender } = payload;
  return new EmbedBuilder()
    .setColor(COLORS.release)
    .setAuthor({ name: sender.login, iconURL: avatar(sender), url: sender.html_url })
    .setTitle(`🚀 Release ${action}: ${release.tag_name}`)
    .setURL(release.html_url)
    .setDescription(truncate(release.body, 400))
    .addFields(
      { name: "Repo", value: repoLine(repo), inline: true },
      { name: "Pre-release", value: release.prerelease ? "Yes" : "No", inline: true }
    )
    .setTimestamp();
}

function formatStar(payload) {
  const { action, repository: repo, sender } = payload;
  const stars = repo.stargazers_count;
  return new EmbedBuilder()
    .setColor(COLORS.release)
    .setAuthor({ name: sender.login, iconURL: avatar(sender), url: sender.html_url })
    .setTitle(`⭐ ${sender.login} ${action === "created" ? "starred" : "unstarred"} ${repo.full_name}`)
    .setURL(repo.html_url)
    .addFields({ name: "Total Stars", value: String(stars), inline: true })
    .setTimestamp();
}

function formatFork(payload) {
  const { forkee, repository: repo, sender } = payload;
  return new EmbedBuilder()
    .setColor(COLORS.general)
    .setAuthor({ name: sender.login, iconURL: avatar(sender), url: sender.html_url })
    .setTitle(`🍴 ${sender.login} forked ${repo.full_name}`)
    .setURL(forkee.html_url)
    .addFields(
      { name: "Original", value: repoLine(repo), inline: true },
      { name: "Fork", value: repoLine(forkee), inline: true }
    )
    .setTimestamp();
}

function formatWorkflowRun(payload) {
  const { action, workflow_run: run, repository: repo } = payload;
  if (action !== "completed") return null;

  const statusMap = {
    success: { icon: "✅", color: COLORS.ci_pass },
    failure: { icon: "❌", color: COLORS.ci_fail },
    cancelled: { icon: "🚫", color: COLORS.issue_closed },
  };
  const { icon, color } = statusMap[run.conclusion] || { icon: "🔄", color: COLORS.ci_pending };

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`${icon} Workflow: ${run.name} — ${run.conclusion}`)
    .setURL(run.html_url)
    .addFields(
      { name: "Repo", value: repoLine(repo), inline: true },
      { name: "Branch", value: `\`${run.head_branch}\``, inline: true },
      { name: "Trigger", value: run.event, inline: true }
    )
    .setTimestamp();
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

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
      default:                    return null;
    }
  } catch (err) {
    console.error(`[embeds] Failed to build embed for ${eventType}:`, err.message);
    return null;
  }
}

module.exports = { buildEmbed };
