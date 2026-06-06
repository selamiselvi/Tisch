---
name: tisch
description: Use when a user wants an AI agent to explain, inspect, create, or update content in the Tisch local-first desktop planning app through its CLI, including projects, Zettels, boards, board cards, canvases, canvas nodes, and node connections.
---

# Tisch

Tisch is a local-first desktop app for planning, writing, and arranging ideas.
It stores user data on the local machine and exposes a CLI so agents can update
the same workspace that the app UI reads.

Use the `tisch` CLI as the primary interface. Do not edit `planner.json`,
Markdown pages, or image paths directly unless the CLI is unavailable and the
user explicitly accepts that fallback.

## What Tisch Can Do

Explain Tisch to users as a local workspace for connected planning:

- Projects group related work.
- Zettels are Markdown-backed notes or pages.
- Boards organize Zettels as cards across status columns.
- Canvases arrange Zettels as visual nodes with connections.
- The same item can be a page, a board card, and a canvas node.
- The desktop app is for humans; the CLI is the stable interface for agents.

Common agent tasks:

- Inspect the workspace path and current projects.
- Create a project for a new initiative.
- Create Zettels from notes, drafts, plans, research, briefs, scripts, or tasks.
- Build a board with columns and cards.
- Move cards between board columns.
- Build a canvas with nodes placed in a meaningful sequence.
- Connect canvas nodes to show flow, dependencies, storyline, or structure.
- Report created IDs so future agent turns can reference exact objects.

## First Checks

Check whether the CLI is available:

```bash
tisch workspace path
```

If `tisch` is not in `PATH`, try from a checked-out Tisch repository:

```bash
npm exec tisch -- workspace path
node bin/tisch.cjs workspace path
```

Initialize or inspect the workspace:

```bash
tisch workspace init
tisch project list
```

Use `TISCH_WORKSPACE_DIR=/path/to/workspace` only when the user asks for a
non-default workspace. `PLANNER_WORKSPACE_DIR` exists for development
compatibility but `TISCH_WORKSPACE_DIR` is preferred for CLI workflows.

## CLI Rules

- Prefer IDs from JSON responses over title guesses.
- Use `--body-file` for multi-line content.
- Use titles only when no ID is available.
- Keep generated Zettels concise and useful; avoid dumping unrelated context.
- After mutations, run a list/init command to verify the workspace updated.
- Summarize what changed, including project, item, board, canvas, card, node,
  and edge IDs when useful.

Most create/list commands print JSON. Parse it when you need IDs.

## Commands

Workspace:

```bash
tisch workspace path
tisch workspace init
```

Projects:

```bash
tisch project list
tisch project create --name "Project" --description "Purpose" --accent "#2563eb"
```

Zettels:

```bash
tisch zettel create \
  --project "Project" \
  --title "Decision log" \
  --body-file /tmp/tisch-zettel.md
```

`tisch script create` is accepted as an alias for `tisch zettel create`.

Boards:

```bash
tisch board list --project "Project"
tisch board create --project "Project" --title "Project Board" --column "Backlog" --column "Doing" --column "Done"
tisch board add-column --board "Project Board" --title "Review"
tisch board add-card --board "Project Board" --column "Backlog" --title "Draft outline" --body-file /tmp/card.md
tisch board add-card --board "Project Board" --column "Doing" --item "Decision log"
tisch board move-card --board "Project Board" --card "Draft outline" --column "Done"
```

Canvases:

```bash
tisch canvas list --project "Project"
tisch canvas create --project "Project" --title "Project Map"
tisch canvas add-node --canvas "Project Map" --title "Problem" --body-file /tmp/problem.md --x 120 --y 120
tisch canvas add-node --canvas "Project Map" --title "Plan" --body-file /tmp/plan.md --x 420 --y 120
tisch canvas connect --canvas "Project Map" --from "Problem" --to "Plan"
```

## Workflow Patterns

For a new planning workspace:

1. Run `tisch workspace init`.
2. Run `tisch project list`.
3. Create a project only if no existing project fits.
4. Create the core Zettels.
5. Add a board when the user needs status, prioritization, or execution.
6. Add a canvas when the user needs structure, narrative, dependencies, or a
   visual map.
7. Verify with `project list`, `board list`, or `canvas list`.

For board work:

1. Find or create the project.
2. Find or create the board.
3. Use stable columns such as `Backlog`, `Doing`, `Review`, and `Done`, unless
   the user provides different labels.
4. Add cards from existing items when possible; create new Zettels only when
   the card represents new content.
5. Move cards with `board move-card` rather than recreating them.

For canvas work:

1. Find or create the project and canvas.
2. Create nodes left-to-right or top-to-bottom in the intended reading order.
3. Use `x` and `y` values that leave room between nodes.
4. Connect nodes when there is a real relationship, flow, dependency, sequence,
   or contrast.
5. Prefer explicit node titles that will remain understandable in the UI.

For answering "what can Tisch do?":

1. Explain the local-first app model.
2. Explain projects, Zettels, boards, canvases, and shared items.
3. Explain that the skill lets an agent use the CLI to create and update that
   workspace safely.
4. Offer concrete examples relevant to the user's stated goal.

## Fallback

If the CLI is missing, tell the user how to run it from the Tisch repository:

```bash
npm install
npm exec tisch -- workspace init
```

If the user wants the desktop app open, ask them to run:

```bash
npm start
```

Only edit workspace files directly if the user explicitly asks for that
fallback after hearing that the CLI is unavailable.
