import type { PlannerData } from '../types'

export const seedPlannerData: PlannerData = {
  schemaVersion: 1,
  updatedAt: new Date().toISOString(),
  projects: [
    {
      id: 'launch-plan',
      name: 'Launch Plan',
      accent: '#2563eb',
      description: 'Produkt, User proof, Short-form-Ideen und App-Demos.',
    },
    {
      id: 'research',
      name: 'research',
      accent: '#0f766e',
      description: 'Kurzdialoge, Lernfortschritt und Sprachlern-Content.',
    },
    {
      id: 'operations',
      name: 'Operations',
      accent: '#b45309',
      description: 'Workflow utility, Vertrauen, Use Cases und Conversion.',
    },
    {
      id: 'lab',
      name: 'Ideen-Labor',
      accent: '#7c3aed',
      description: 'Freie Experimente, Hook-Sammlungen und lose Formate.',
    },
  ],
  boards: [
    {
      id: 'launch-plan-tiktok-board',
      title: 'Launch Plan Short-form Pipeline',
      projectId: 'launch-plan',
      description:
        'Von roher Posting-Idee bis produktionsbereit. Karten koennen mit Canvas und Notizen verknuepft werden.',
      columns: [
        { id: 'idea', title: 'Idee' },
        { id: 'planned', title: 'Geplant' },
        { id: 'script', title: 'Skript' },
        { id: 'ready', title: 'Bereit' },
      ],
      cards: [
        {
          id: 'card-before-after-hook',
          title: 'Vorher/Nachher als kalter Scroll-Stopp',
          summary:
            'Short-form beginnt mit einem schlechten listing image und zeigt dann die bessere Version.',
          projectId: 'launch-plan',
          columnId: 'idea',
          tags: ['Short-form', 'Hook', 'Demo'],
          noteIds: ['note-launch-plan-script'],
          canvasIds: ['canvas-launch-plan-demo'],
        },
        {
          id: 'card-five-mistakes',
          title: '5 Fehler bei Auto-listing images',
          summary:
            'Schnelle Liste mit konkreten Bildfehlern, danach Launch Plan als Abkuerzung.',
          projectId: 'launch-plan',
          columnId: 'planned',
          tags: ['Educational', 'Carousel'],
          noteIds: [],
          canvasIds: [],
        },
        {
          id: 'card-ai-demo',
          title: 'Ein Bild reicht fuer ein ganzes Set',
          summary:
            'Kurze Produktdemo: Upload, Varianten, bessere Anzeige, Call to Action.',
          projectId: 'launch-plan',
          columnId: 'script',
          tags: ['Produktdemo', 'Short-form'],
          noteIds: ['note-launch-plan-script'],
          canvasIds: ['canvas-launch-plan-demo'],
        },
      ],
    },
  ],
  canvases: [
    {
      id: 'canvas-launch-plan-demo',
      title: 'Launch Plan Demo-Video Szenen',
      projectId: 'launch-plan',
      description:
        'Freie Canvas fuer Hook, Szenenfolge und Verbindungen zwischen Gedanken.',
      nodes: [
        {
          id: 'node-hook',
          title: 'Hook',
          body: 'Dieses Foto kostet dich wahrscheinlich Anfragen.',
          kind: 'hook',
          x: 40,
          y: 110,
          refs: [{ kind: 'card', id: 'card-before-after-hook' }],
        },
        {
          id: 'node-scene-upload',
          title: 'Szene 1',
          body: 'Schlechtes Originalbild zeigen, dann Upload in Launch Plan.',
          kind: 'scene',
          x: 360,
          y: 50,
          refs: [],
        },
        {
          id: 'node-scene-result',
          title: 'Szene 2',
          body: 'Mehrere saubere Varianten nebeneinander zeigen.',
          kind: 'scene',
          x: 680,
          y: 150,
          refs: [],
        },
        {
          id: 'node-script',
          title: 'Skript',
          body: 'Ausformulierung in Markdown-Notiz.',
          kind: 'beat',
          x: 360,
          y: 310,
          refs: [{ kind: 'note', id: 'note-launch-plan-script' }],
        },
      ],
      edges: [
        {
          id: 'edge-hook-upload',
          source: 'node-hook',
          target: 'node-scene-upload',
          label: 'Start',
        },
        {
          id: 'edge-upload-result',
          source: 'node-scene-upload',
          target: 'node-scene-result',
          label: 'Reveal',
        },
        {
          id: 'edge-script-scenes',
          source: 'node-script',
          target: 'node-scene-upload',
          label: 'Text',
        },
      ],
    },
  ],
  notes: [
    {
      id: 'note-launch-plan-script',
      title: 'Launch Plan Short-form Skript - Demo',
      projectId: 'launch-plan',
      path: 'notes/launch-plan-tiktok-demo.md',
      tags: ['Skript', 'Short-form', 'Demo'],
      linkedResourceIds: ['card-ai-demo', 'canvas-launch-plan-demo'],
      content: `# Launch Plan Short-form Skript - Demo

## Hook
"Dieses eine Foto kann entscheiden, ob jemand dein Auto ueberhaupt anklickt."

## Szenen

1. Schlechtes listing image zeigen.
2. Kurz in Launch Plan ziehen.
3. Drei bessere Varianten zeigen.
4. Screenshot vom besseren Inserat.

## Voiceover

Viele Autoinserate verlieren Aufmerksamkeit, bevor der Text ueberhaupt gelesen wird. Launch Plan macht aus einem normalen Upload direkt bessere Varianten fuer dein Inserat.

## CTA

Probier es mit deinem schlechtesten Foto aus.
`,
    },
  ],
  links: [
    {
      id: 'link-card-canvas',
      from: { kind: 'card', id: 'card-ai-demo' },
      to: { kind: 'canvas', id: 'canvas-launch-plan-demo' },
      label: 'Szenenplanung',
    },
    {
      id: 'link-note-card',
      from: { kind: 'note', id: 'note-launch-plan-script' },
      to: { kind: 'card', id: 'card-ai-demo' },
      label: 'Skript',
    },
  ],
}
