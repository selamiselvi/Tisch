# Contributing

Thanks for taking the time to improve Tisch.

## Development Setup

```bash
npm install
npm start
```

Use these checks before sending changes:

```bash
npm run lint
npm run build
```

## Pull Requests

- Keep changes focused and explain the user-facing behavior they affect.
- Add or update documentation when behavior, commands, or storage format change.
- Avoid committing local workspace data, generated builds, logs, screenshots,
  `.env` files, or editor metadata.
- Prefer small, reviewable pull requests over broad refactors.

## Storage Changes

Tisch stores user data as `planner.json` plus Markdown files in `pages/`.
Changes to this format should preserve existing workspaces or include a clear
migration path.

## Reporting Issues

When filing a bug, include:

- Operating system
- Node.js and npm versions
- Steps to reproduce
- Expected behavior
- Actual behavior
