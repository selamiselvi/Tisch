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
      description: 'Produktideen, Abläufe, Skripte und offene Gedanken.',
    },
    {
      id: 'research',
      name: 'research',
      accent: '#0f766e',
      description: 'Lernprodukt, Sprachlogik, Inhalte und Experimente.',
    },
    {
      id: 'operations',
      name: 'Operations',
      accent: '#b45309',
      description: 'Workflow utility, Dokumente, Workflows und Kommunikation.',
    },
    {
      id: 'lab',
      name: 'Labor',
      accent: '#6d5dfc',
      description: 'Freie Ideen ohne Projektbindung.',
    },
  ],
  items: [
    {
      id: 'item-launch-plan-overview',
      projectId: 'launch-plan',
      title: 'Launch Plan Arbeitsnotiz',
      summary: 'Eine freie Seite fuer Gedanken, Szenen, Rohtext und offene Fragen.',
      contentPath: 'pages/launch-plan-arbeitsnotiz.md',
      tags: ['Seite'],
      kind: 'script',
      status: 'planung',
      done: false,
      createdAt: now,
      updatedAt: now,
      content: `# Launch Plan Arbeitsnotiz

Das ist eine normale Seite. Sie kann allein stehen, im Board als Karte erscheinen und auf dem Canvas als Node platziert werden.

## Gedanken

- Was ist der kleinste starke Einstieg?
- Welche Bilder oder Screenshots brauchen wir?
- Welche Version ist als naechstes produktionsreif?
`,
    },
    {
      id: 'item-launch-plan-hook',
      projectId: 'launch-plan',
      title: 'Hook: schlechtes listing image',
      summary: 'Dieses eine Foto kann entscheiden, ob jemand dein Auto ueberhaupt anklickt.',
      contentPath: 'pages/hook-schlechtes-inseratfoto.md',
      tags: ['Hook', 'Idee'],
      kind: 'script',
      status: 'planung',
      done: false,
      createdAt: now,
      updatedAt: now,
      content: `# Hook: schlechtes listing image

Dieses eine Foto kann entscheiden, ob jemand dein Auto ueberhaupt anklickt.

Kurz, direkt, ohne Erklaerung starten. Danach erst zeigen, warum das Bild schwach ist.
`,
    },
    {
      id: 'item-launch-plan-scenes',
      projectId: 'launch-plan',
      title: 'Szenenfolge',
      summary: 'Originalbild, Upload, Ergebnis, Vergleich.',
      contentPath: 'pages/szenenfolge.md',
      tags: ['Ablauf'],
      kind: 'script',
      status: 'arbeit',
      done: false,
      createdAt: now,
      updatedAt: now,
      content: `# Szenenfolge

1. Ausgangsbild zeigen.
2. Upload oder Auswahl zeigen.
3. Varianten als kurzer Reveal.
4. Bessere Anzeige als Abschlussbild.
`,
    },
  ],
  boards: [
    {
      id: 'board-launch-plan',
      title: 'Launch Plan Board',
      projectId: 'launch-plan',
      columns: [
        { id: 'planung', title: 'Planung' },
        { id: 'arbeit', title: 'In Arbeit' },
        { id: 'fertig', title: 'Fertig' },
      ],
      cards: [
        {
          id: 'card-launch-plan-hook',
          itemId: 'item-launch-plan-hook',
          columnId: 'planung',
        },
        {
          id: 'card-launch-plan-scenes',
          itemId: 'item-launch-plan-scenes',
          columnId: 'arbeit',
        },
      ],
    },
  ],
  canvases: [
    {
      id: 'canvas-launch-plan',
      title: 'Launch Plan Canvas',
      projectId: 'launch-plan',
      nodes: [
        {
          id: 'node-launch-plan-overview',
          itemId: 'item-launch-plan-overview',
          x: 80,
          y: 130,
          width: 230,
        },
        {
          id: 'node-launch-plan-hook',
          itemId: 'item-launch-plan-hook',
          x: 400,
          y: 90,
          width: 240,
        },
        {
          id: 'node-launch-plan-scenes',
          itemId: 'item-launch-plan-scenes',
          x: 400,
          y: 300,
          width: 240,
        },
      ],
      edges: [
        {
          id: 'edge-launch-plan-hook-scenes',
          source: 'node-launch-plan-hook',
          target: 'node-launch-plan-scenes',
        },
        {
          id: 'edge-launch-plan-overview-hook',
          source: 'node-launch-plan-overview',
          target: 'node-launch-plan-hook',
        },
      ],
    },
  ],
  links: [
    {
      id: 'link-hook-scenes',
      fromItemId: 'item-launch-plan-hook',
      toItemId: 'item-launch-plan-scenes',
      label: 'fuehrt zu',
    },
  ],
}
