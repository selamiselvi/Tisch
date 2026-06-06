# Security Policy

## Supported Versions

Tisch is early-stage software. Security fixes target the current `main` branch.

## Reporting a Vulnerability

Please report vulnerabilities through GitHub Security Advisories if they are
enabled for the repository. If advisories are not available, open a minimal
issue that states a security concern exists without publishing exploit details.

Do not include private workspace data, tokens, credentials, or personal files in
public issues.

## Local Data Model

Tisch is local-first. Workspace data is stored on the user's machine and is not
sent to a hosted Tisch service.

The app can import local Markdown files and images into the workspace. Treat the
workspace directory as user data and do not commit it to Git.
