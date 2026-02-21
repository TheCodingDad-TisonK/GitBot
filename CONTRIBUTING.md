# Contributing to GitBot

First off — thanks for taking the time to contribute! GitBot is a self-hosted Discord bot, and community contributions help make it better for everyone running their own instance.

---

## Table of Contents

- [Contributing to GitBot](#contributing-to-gitbot)
  - [Table of Contents](#table-of-contents)
  - [Getting Started](#getting-started)
  - [Development Workflow](#development-workflow)
  - [Commit Messages](#commit-messages)
  - [Pull Request Guidelines](#pull-request-guidelines)
  - [Code Style](#code-style)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features](#suggesting-features)
  - [Questions?](#questions)

---

## Getting Started

1. **Fork** the repository and clone your fork locally.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the example config and fill in your values:
   ```bash
   cp config.example.yml config.yml
   ```
4. Run the bot locally to make sure everything works before making changes.

---

## Development Workflow

1. **Branch off `development`** — never work directly on `main`.
   ```bash
   git checkout development
   git pull origin development
   git checkout -b type/short-description
   ```

   Branch naming conventions:
   | Prefix | Use for |
   |--------|---------|
   | `feature/` | New functionality |
   | `fix/` | Bug fixes |
   | `docs/` | Documentation changes |
   | `refactor/` | Code cleanup with no behavior change |
   | `chore/` | Dependency updates, config changes, etc. |

2. **Make your changes**, keeping commits focused and logical.

3. **Test your changes** against a real Discord server + GitHub webhook setup if possible. At minimum, make sure the bot starts without errors.

4. **Push your branch** and open a pull request against `development`.

---

## Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
type(scope): short description

Optional longer explanation if needed.
```

Examples:
```
feat(events): add support for workflow_run events
fix(embed): truncate long commit messages to prevent Discord API errors
docs(readme): update self-hosting instructions
```

---

## Pull Request Guidelines

- **Target `development`**, not `main`.
- Fill out the PR description — explain *what* changed and *why*.
- Keep PRs focused. One feature or fix per PR is much easier to review.
- If your PR fixes an open issue, reference it: `Closes #42`.
- Don't bump the version yourself — that's handled during releases.

---

## Code Style

- Follow the existing code style in the files you're editing.
- Use meaningful variable and function names.
- Add comments for anything non-obvious, especially around webhook parsing or Discord API quirks.
- **Never commit secrets, tokens, or credentials** — not even in example files. Use placeholder strings like `YOUR_BOT_TOKEN_HERE`.
- Keep new event handlers consistent with how existing ones are structured.

---

## Reporting Bugs

Open an issue and include:

- A clear, descriptive title
- Steps to reproduce the issue
- What you expected to happen vs. what actually happened
- Your Node.js version, OS, and any relevant config (redact tokens!)
- Any error output from the console

---

## Suggesting Features

Open an issue with the `enhancement` label. Describe:

- The GitHub event or Discord behavior you want to improve
- Why it would be useful for self-hosters
- Any implementation ideas you have (optional, but appreciated)

---

## Questions?

If you're unsure about something before opening a PR, feel free to open a discussion or draft PR and ask. We'd rather help you get it right than see a good contribution go to waste.