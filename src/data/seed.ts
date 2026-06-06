import type { PlannerData } from '../types'

const now = new Date().toISOString()

export const seedPlannerData: PlannerData = {
  schemaVersion: 2,
  updatedAt: now,
  projects: [
    {
      id: 'launch-plan',
      name: 'Launch Plan',
      accent: '#2563eb',
      description: 'Product ideas, content drafts, notes, and open questions.',
    },
    {
      id: 'research',
      name: 'Research',
      accent: '#0f766e',
      description: 'References, decisions, experiments, and follow-up notes.',
    },
    {
      id: 'operations',
      name: 'Operations',
      accent: '#b45309',
      description: 'Processes, documents, workflows, and communication.',
    },
    {
      id: 'lab',
      name: 'Labor',
      accent: '#6d5dfc',
      description: 'Loose ideas without a fixed project yet.',
    },
  ],
  items: [
    {
      id: 'item-launch-overview',
      projectId: 'launch-plan',
      title: 'Project Overview',
      summary: 'A free page for thoughts, drafts, notes, and open questions.',
      contentPath: 'pages/project-overview.md',
      kind: 'script',
      status: 'planung',
      done: false,
      createdAt: now,
      updatedAt: now,
      content: `# Project Overview

This is a regular page. It can stand alone, appear as a board card, and be placed on the canvas as a node.

## Notes

- What is the smallest useful next step?
- Which assets or screenshots are needed?
- Which draft is ready to refine next?
`,
    },
    {
      id: 'item-launch-hook',
      projectId: 'launch-plan',
      title: 'Opening Hook',
      summary: 'A short opening note for the first moment of a launch story.',
      contentPath: 'pages/opening-hook.md',
      kind: 'script',
      status: 'planung',
      done: false,
      createdAt: now,
      updatedAt: now,
      content: `# Opening Hook

Start with the concrete user problem before explaining the full product.

Keep it short, direct, and specific. Add context only after the first point is clear.
`,
    },
    {
      id: 'item-launch-scenes',
      projectId: 'launch-plan',
      title: 'Scene Sequence',
      summary: 'Problem, workflow, result, and next action.',
      contentPath: 'pages/scene-sequence.md',
      kind: 'script',
      status: 'arbeit',
      done: false,
      createdAt: now,
      updatedAt: now,
      content: `# Scene Sequence

1. Show the starting problem.
2. Show the workflow or decision.
3. Reveal the improved result.
4. End with the next action.
`,
    },
  ],
  boards: [
    {
      id: 'board-launch',
      title: 'Launch Board',
      projectId: 'launch-plan',
      columns: [
        { id: 'planung', title: 'Planung' },
        { id: 'arbeit', title: 'In Arbeit' },
        { id: 'fertig', title: 'Fertig' },
      ],
      cards: [
        {
          id: 'card-launch-hook',
          itemId: 'item-launch-hook',
          columnId: 'planung',
        },
        {
          id: 'card-launch-scenes',
          itemId: 'item-launch-scenes',
          columnId: 'arbeit',
        },
      ],
    },
  ],
  canvases: [
    {
      id: 'canvas-launch',
      title: 'Launch Canvas',
      projectId: 'launch-plan',
      nodes: [
        {
          id: 'node-launch-overview',
          itemId: 'item-launch-overview',
          x: 80,
          y: 130,
          width: 230,
        },
        {
          id: 'node-launch-hook',
          itemId: 'item-launch-hook',
          x: 400,
          y: 90,
          width: 240,
        },
        {
          id: 'node-launch-scenes',
          itemId: 'item-launch-scenes',
          x: 400,
          y: 300,
          width: 240,
        },
      ],
      edges: [
        {
          id: 'edge-launch-hook-scenes',
          source: 'node-launch-hook',
          target: 'node-launch-scenes',
        },
        {
          id: 'edge-launch-overview-hook',
          source: 'node-launch-overview',
          target: 'node-launch-hook',
        },
      ],
    },
  ],
  links: [
    {
      id: 'link-hook-scenes',
      fromItemId: 'item-launch-hook',
      toItemId: 'item-launch-scenes',
      label: 'fuehrt zu',
    },
  ],
}
