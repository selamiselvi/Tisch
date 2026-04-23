# Tisch

Lokale Desktop-App zum Planen, Schreiben und Ordnen von Ideen. Tisch ist kein gehostetes Tool: Nutzdaten liegen lokal auf dem Rechner im App-Datenordner und nicht im Git-Repository.

## Idee

Der Kern ist ein gemeinsames Zettel-Modell. Ein Zettel kann gleichzeitig sein:

- eine Markdown-Seite mit langem Text
- eine Karte in einem Board
- ein Node auf einem Canvas

Diese Darstellungen sind keine getrennten Daten. Board-Karten und Canvas-Nodes zeigen denselben `Item`, der auch eine volle Markdown-Seite besitzt.

## Stack

- Electron als Desktop-Shell
- React + TypeScript fuer die Oberflaeche
- Vite fuer schnelles Entwickeln
- React Flow fuer Canvas/Node-Verbindungen
- react-markdown fuer Seiten-Preview
- lokale JSON- und Markdown-Dateien als Datenbasis

Tauri bleibt eine moegliche spaetere Shell-Alternative. Aktuell ist Electron gewaehlt, weil Node/npm vorhanden sind und die App direkt als eigenes Programm laeuft.

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
npm exec tisch -- workspace path
```

## Lokale Daten

Der Workspace liegt standardmaessig unter `app.getPath('userData')/workspace`, also im betriebssystemspezifischen App-Datenordner. Damit landen Nutzdaten nicht mehr in Git-Diffs oder auf GitHub.

```text
<userData>/workspace/
  planner.json
  pages/
    beispiel.md
```

`planner.json` enthaelt Projekte, Items, Boards, Canvas-Nodes und Links. Lange Texte liegen als echte Markdown-Dateien unter `pages/`.

Fuer Entwicklung oder bewusste Dateiablaeufe kann der Speicherort mit `PLANNER_WORKSPACE_DIR=/pfad/zum/workspace` ueberschrieben werden.

## UI-Grundstruktur

- Linkes Paneel: Projekte und Zettel, einklappbar
- Mitte: aktive Arbeitsflaeche
- Rechtes Paneel: Inspector fuer Status, Darstellungen, Datei und Links, optional einklappbar
- Seite: ein einzelner Schreib-/Lesebereich mit Toggle `Edit` / `Preview`
- Canvas: einfache Text-/Bild-Nodes mit Linien zwischen Nodes
- Board: flexible Spalten, Karten, Done-Markierung und Ausblenden fertiger Items

## KI-freundliche API

Die UI spricht nicht direkt mit Dateien. Sie nutzt `src/lib/plannerApi.ts`.
Electron und das lokale CLI teilen sich die Speicherlogik in
`lib/workspace-store.cjs`.

In Electron stellt `electron/preload.cjs` diese Funktionen bereit:

- `window.planner.getWorkspacePath()`
- `window.planner.loadWorkspace()`
- `window.planner.saveWorkspace(data)`
- `window.planner.onWorkspaceChanged(callback)`

Dadurch koennen Codex und andere lokale KI-Agenten die App ueber dieselbe
Datenstruktur manipulieren wie die UI. Wenn die App geoeffnet ist, erkennt sie
Workspace-Aenderungen und laedt externe Agent-/CLI-Aenderungen neu.

### Lokales CLI

Das Agent-freundliche CLI heisst `tisch`:

```bash
npm exec tisch -- workspace init
npm exec tisch -- project list
npm exec tisch -- project create --name "Short-form"
npm exec tisch -- zettel create --project "Short-form" --title "Hook" --body "..."
npm exec tisch -- canvas create --project "Short-form" --title "Videoidee"
npm exec tisch -- canvas add-node --canvas "Videoidee" --title "Hook" --body "..."
npm exec tisch -- canvas connect --canvas "Videoidee" --from "Hook" --to "CTA"
```

In einer installierten Distribution kann dasselbe CLI spaeter als `tisch ...`
verlinkt werden. `TISCH_WORKSPACE_DIR=/pfad/zum/workspace` ueberschreibt den
Standardpfad; `PLANNER_WORKSPACE_DIR` bleibt fuer Entwicklung kompatibel.

### Codex Skill

Der wiederverwendbare Codex-Skill ist kein Teil dieses App-Repositories. Lokal
kann er als `tisch`-Skill unter `~/.codex/skills/tisch` installiert werden. Der
Skill weist Agenten an, Tisch ueber das CLI zu bedienen und definiert Standards
fuer Zettel, Short-form-Canvas-Strukturen, B-Roll-Nodes und Verbindungen.

## Datenmodell

Die zentralen Typen liegen in `src/types.ts`:

- `Project`
- `Item`
- `Board`
- `BoardCard`
- `IdeaCanvas`
- `CanvasNode`
- `PlannerLink`
- `PlannerData`

## Naechste Ausbaustufen

- Item-Editor fuer Tags, Status und Bildpfad
- echte Link-Verwaltung zwischen Items
- mehrere Boards und Canvases pro Projekt
- Bildimport fuer Canvas-Nodes
- GitHub-Sync aus der App heraus
- saubere Migration alter Workspace-Versionen
