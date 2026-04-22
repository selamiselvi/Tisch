# Social Media Planning

Lokale Desktop-App zum Planen von Social-Media-Postings, Skripten, Hooks und Content-Pipelines. Die App ist fuer den Laptop gedacht: alle Daten liegen lesbar im Projektordner und koennen per GitHub gesichert werden.

## Ziel

Dieses Projekt ist die Planungszentrale vor der eigentlichen Posting-Produktion. Es soll Ideen, Kanban-Boards, freie Canvas-Planung und Markdown-Skripte miteinander verbinden, damit Menschen und KI-Agenten dieselben lokalen Daten bearbeiten koennen.

## Stack

- Electron als Desktop-Shell
- React + TypeScript fuer die Oberflaeche
- Vite fuer schnelles Entwickeln
- React Flow fuer Canvas/Node-Verbindungen
- react-markdown fuer Markdown-Ansicht
- lokale JSON- und Markdown-Dateien als Datenbasis

Tauri bleibt eine moegliche spaetere Shell-Alternative, aber aktuell ist Electron bewusst gewaehlt, weil Node/npm vorhanden sind und die App sofort als eigenes Programm laeuft. Das Datenmodell und die `plannerApi` sind von der Shell getrennt, damit die lokalen Dateien nicht an Electron gebunden sind.

## Starten

```bash
npm install
npm start
```

`npm start` oeffnet ein eigenes App-Fenster. Es ist kein Chrome-Tab noetig.

Weitere Kommandos:

```bash
npm run dev
npm run build
npm run lint
npm run electron:preview
```

## Lokale Daten

Beim ersten Start legt die App den Workspace hier an:

```text
workspace/
  planner.json
  notes/
    launch-plan-tiktok-demo.md
```

`planner.json` enthaelt Projekte, Boards, Karten, Canvases, Nodes und Verbindungen. Markdown-Inhalte liegen als echte `.md`-Dateien unter `workspace/notes/`.

## KI-freundliche API

Die UI spricht nicht direkt mit Dateien. Sie nutzt `src/lib/plannerApi.ts`.

In Electron stellt `electron/preload.cjs` diese Funktionen bereit:

- `window.planner.getWorkspacePath()`
- `window.planner.loadWorkspace()`
- `window.planner.saveWorkspace(data)`

Das macht die App fuer Codex und andere lokale KI-Agenten angenehm manipulierbar: Ein Agent kann entweder die Workspace-Dateien direkt bearbeiten oder ueber dieselbe Datenstruktur arbeiten wie die UI.

## Datenmodell

Die zentralen Typen liegen in `src/types.ts`:

- `Project`
- `Board`
- `BoardCard`
- `IdeaCanvas`
- `CanvasNode`
- `NoteDoc`
- `PlannerLink`
- `PlannerData`

Die erste Version startet mit drei Arbeitsmodi:

- Board: Kanban-Pipeline fuer Posting-Status
- Canvas: visuelle Szenen- und Ideenplanung
- Markdown: Skripte und Notizen mit Live-Preview

## GitHub

Dieses Repository kann normal versioniert werden. Sinnvoll ist, `workspace/` mitzunehmen, wenn die Planungsdaten selbst gesichert werden sollen. Falls nur die App geteilt werden soll, kann `workspace/` spaeter in `.gitignore` aufgenommen werden.

## Naechste Ausbaustufen

- mehrere Boards und Canvases pro Projekt anlegen/waehlen
- direkte Bearbeitung von Kartentitel, Tags und Zusammenfassung
- bessere Link-Verwaltung zwischen Karten, Nodes und Notizen
- GitHub-Sync aus der App heraus
- optionaler Import/Export fuer andere lokale Workspaces
