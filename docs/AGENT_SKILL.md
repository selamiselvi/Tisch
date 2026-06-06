# Tisch Companion Skill

Tisch includes a companion Codex skill for agents. The app and CLI are the
software; the skill teaches an agent how to use the CLI safely.

The skill lives in:

```text
skills/tisch/
```

## What The Skill Adds

With the skill installed, an agent can:

- explain what Tisch is and how the app is structured
- inspect the local Tisch workspace
- create projects and Zettels
- create boards, columns, and cards
- move board cards
- create canvases, nodes, and connections
- reuse JSON IDs returned by the CLI instead of editing workspace files directly

## Install

In Codex, ask:

```text
Install the Tisch skill from https://github.com/selamiselvi/Tisch/tree/main/skills/tisch
```

Then restart Codex so the skill is available.

For manual local installation, copy or symlink `skills/tisch` into your Codex
skills directory:

```bash
mkdir -p ~/.codex/skills
ln -s /path/to/Tisch/skills/tisch ~/.codex/skills/tisch
```

## Use

After installation, ask an agent for Tisch work directly:

```text
Use $tisch to create a project, a planning board, and a canvas for this launch.
```

The skill expects the `tisch` CLI to be available. From this repository, agents
can also run:

```bash
npm exec tisch -- workspace init
```
