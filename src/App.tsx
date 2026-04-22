import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  applyEdgeChanges,
  type Edge,
  type EdgeChange,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { nanoid } from 'nanoid'
import {
  BookOpen,
  GitBranch,
  KanbanSquare,
  Link2,
  Map,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { getWorkspacePath, loadPlanner, savePlanner } from './lib/plannerApi'
import type {
  Board,
  BoardCard,
  CanvasEdge,
  CanvasNode,
  IdeaCanvas,
  NoteDoc,
  PlannerData,
  ProjectId,
} from './types'
import './App.css'

type ViewMode = 'board' | 'canvas' | 'notes'

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

function App() {
  const [data, setData] = useState<PlannerData | null>(null)
  const [workspacePath, setWorkspacePath] = useState('')
  const [activeProjectId, setActiveProjectId] = useState<ProjectId>('launch-plan')
  const [view, setView] = useState<ViewMode>('board')
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState('bereit')
  const saveTimer = useRef<number | null>(null)

  useEffect(() => {
    void Promise.all([loadPlanner(), getWorkspacePath()]).then(
      ([planner, path]) => {
        setData(planner)
        setWorkspacePath(path)
      },
    )
  }, [])

  const activeProject = data?.projects.find((project) => project.id === activeProjectId)
  const boards = useMemo(
    () => data?.boards.filter((board) => board.projectId === activeProjectId) ?? [],
    [data, activeProjectId],
  )
  const canvases = useMemo(
    () =>
      data?.canvases.filter((canvas) => canvas.projectId === activeProjectId) ?? [],
    [data, activeProjectId],
  )
  const notes = useMemo(
    () => data?.notes.filter((note) => note.projectId === activeProjectId) ?? [],
    [data, activeProjectId],
  )

  const activeBoard = boards[0]
  const activeCanvas = canvases[0]
  const activeNote =
    notes.find((note) => note.id === selectedNoteId) ?? notes[0] ?? null
  const selectedCard =
    activeBoard?.cards.find((card) => card.id === selectedCardId) ??
    activeBoard?.cards[0] ??
    null
  const selectedNode =
    activeCanvas?.nodes.find((node) => node.id === selectedNodeId) ?? null

  const resourceCount =
    (data?.boards.length ?? 0) + (data?.canvases.length ?? 0) + (data?.notes.length ?? 0)

  function commit(next: PlannerData) {
    setData(next)
    setSaveState('speichert')

    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
    }

    saveTimer.current = window.setTimeout(() => {
      void savePlanner(next).then((saved) => {
        setData(saved)
        setSaveState('gespeichert')
      })
    }, 180)
  }

  function updateBoard(boardId: string, updater: (board: Board) => Board) {
    if (!data) {
      return
    }

    commit({
      ...data,
      boards: data.boards.map((board) =>
        board.id === boardId ? updater(board) : board,
      ),
    })
  }

  function updateCanvas(canvasId: string, updater: (canvas: IdeaCanvas) => IdeaCanvas) {
    if (!data) {
      return
    }

    commit({
      ...data,
      canvases: data.canvases.map((canvas) =>
        canvas.id === canvasId ? updater(canvas) : canvas,
      ),
    })
  }

  function updateNote(noteId: string, updater: (note: NoteDoc) => NoteDoc) {
    if (!data) {
      return
    }

    commit({
      ...data,
      notes: data.notes.map((note) => (note.id === noteId ? updater(note) : note)),
    })
  }

  function moveCard(columnId: string) {
    if (!activeBoard || !draggedCardId) {
      return
    }

    updateBoard(activeBoard.id, (board) => ({
      ...board,
      cards: board.cards.map((card) =>
        card.id === draggedCardId ? { ...card, columnId } : card,
      ),
    }))
    setDraggedCardId(null)
  }

  function addCard() {
    if (!activeBoard) {
      return
    }

    const card: BoardCard = {
      id: `card-${nanoid(7)}`,
      title: 'Neue Posting-Idee',
      summary: 'Kurz beschreiben: Hook, Format, Ziel und naechster Schritt.',
      projectId: activeProjectId,
      columnId: activeBoard.columns[0]?.id ?? 'idea',
      tags: ['Draft'],
      noteIds: [],
      canvasIds: activeCanvas ? [activeCanvas.id] : [],
    }

    updateBoard(activeBoard.id, (board) => ({
      ...board,
      cards: [card, ...board.cards],
    }))
    setSelectedCardId(card.id)
  }

  function addNode() {
    if (!activeCanvas) {
      return
    }

    const node: CanvasNode = {
      id: `node-${nanoid(7)}`,
      title: 'Neue Szene',
      body: 'Was passiert hier?',
      kind: 'scene',
      x: 140 + activeCanvas.nodes.length * 36,
      y: 120 + activeCanvas.nodes.length * 32,
      refs: selectedCard ? [{ kind: 'card', id: selectedCard.id }] : [],
    }

    updateCanvas(activeCanvas.id, (canvas) => ({
      ...canvas,
      nodes: [...canvas.nodes, node],
    }))
    setSelectedNodeId(node.id)
  }

  function addNote() {
    if (!data) {
      return
    }

    const title = 'Neue Markdown-Notiz'
    const note: NoteDoc = {
      id: `note-${nanoid(7)}`,
      title,
      projectId: activeProjectId,
      path: `notes/${slugify(`${activeProjectId}-${title}-${nanoid(4)}`)}.md`,
      tags: ['Draft'],
      linkedResourceIds: selectedCard ? [selectedCard.id] : [],
      content: `# ${title}\n\n## Hook\n\n\n## Szenen\n\n1. \n\n## Voiceover\n\n\n## CTA\n\n`,
    }

    commit({
      ...data,
      notes: [note, ...data.notes],
    })
    setSelectedNoteId(note.id)
  }

  function deleteSelected() {
    if (!data) {
      return
    }

    if (view === 'board' && activeBoard && selectedCard) {
      commit({
        ...data,
        boards: data.boards.map((board) =>
          board.id === activeBoard.id
            ? {
                ...board,
                cards: board.cards.filter((card) => card.id !== selectedCard.id),
              }
            : board,
        ),
      })
      setSelectedCardId(null)
      return
    }

    if (view === 'canvas' && activeCanvas && selectedNode) {
      commit({
        ...data,
        canvases: data.canvases.map((canvas) =>
          canvas.id === activeCanvas.id
            ? {
                ...canvas,
                nodes: canvas.nodes.filter((node) => node.id !== selectedNode.id),
                edges: canvas.edges.filter(
                  (edge) =>
                    edge.source !== selectedNode.id && edge.target !== selectedNode.id,
                ),
              }
            : canvas,
        ),
      })
      setSelectedNodeId(null)
      return
    }

    if (view === 'notes' && activeNote) {
      commit({
        ...data,
        notes: data.notes.filter((note) => note.id !== activeNote.id),
      })
      setSelectedNoteId(null)
    }
  }

  function onCanvasNodeDragStop(flowNode: Node) {
    if (!activeCanvas) {
      return
    }

    const nextNodes = activeCanvas.nodes.map((node) => {
      return node.id === flowNode.id
        ? {
            ...node,
            x: flowNode.position?.x ?? node.x,
            y: flowNode.position?.y ?? node.y,
          }
        : node
    })

    updateCanvas(activeCanvas.id, (canvas) => ({ ...canvas, nodes: nextNodes }))
  }

  function onCanvasEdgesChange(changes: EdgeChange[]) {
    if (!activeCanvas) {
      return
    }

    const changed = applyEdgeChanges(changes, toFlowEdges(activeCanvas.edges))
    const nextEdges: CanvasEdge[] = changed.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: activeCanvas.edges.find((canvasEdge) => canvasEdge.id === edge.id)?.label,
    }))

    updateCanvas(activeCanvas.id, (canvas) => ({ ...canvas, edges: nextEdges }))
  }

  if (!data || !activeProject) {
    return <main className="loading">Social Media Planning wird geladen...</main>
  }

  return (
    <main className="planner-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Sparkles size={18} />
          </div>
          <div>
            <strong>Social Media Planning</strong>
            <span>{resourceCount} Ressourcen</span>
          </div>
        </div>

        <nav className="project-list" aria-label="Projekte">
          {data.projects.map((project) => (
            <button
              className={project.id === activeProjectId ? 'active' : ''}
              key={project.id}
              onClick={() => setActiveProjectId(project.id)}
              style={{ '--project-accent': project.accent } as React.CSSProperties}
            >
              <span className="project-dot" />
              <span>
                <strong>{project.name}</strong>
                <small>{project.description}</small>
              </span>
            </button>
          ))}
        </nav>

        <section className="connection-panel">
          <h2>
            <Link2 size={15} />
            Verbindungen
          </h2>
          {data.links.slice(0, 6).map((link) => (
            <div className="link-row" key={link.id}>
              <span>{link.from.kind}</span>
              <strong>{link.label}</strong>
              <span>{link.to.kind}</span>
            </div>
          ))}
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">{activeProject.name}</span>
            <h1>{getViewTitle(view, activeBoard, activeCanvas, activeNote)}</h1>
            <p>{getViewDescription(view, activeBoard, activeCanvas, activeNote)}</p>
          </div>

          <div className="toolbar">
            <span className="save-pill">
              <Save size={14} />
              {saveState}
            </span>
            <button onClick={view === 'board' ? addCard : view === 'canvas' ? addNode : addNote}>
              <Plus size={16} />
            </button>
            <button onClick={deleteSelected}>
              <Trash2 size={16} />
            </button>
          </div>
        </header>

        <div className="view-switch" role="tablist" aria-label="Arbeitsmodus">
          <button
            className={view === 'board' ? 'active' : ''}
            onClick={() => setView('board')}
          >
            <KanbanSquare size={16} />
            Board
          </button>
          <button
            className={view === 'canvas' ? 'active' : ''}
            onClick={() => setView('canvas')}
          >
            <Map size={16} />
            Canvas
          </button>
          <button
            className={view === 'notes' ? 'active' : ''}
            onClick={() => setView('notes')}
          >
            <BookOpen size={16} />
            Markdown
          </button>
        </div>

        {view === 'board' && activeBoard && (
          <BoardView
            board={activeBoard}
            selectedCardId={selectedCard?.id ?? null}
            onSelectCard={setSelectedCardId}
            onDragStart={setDraggedCardId}
            onDropColumn={moveCard}
          />
        )}

        {view === 'canvas' && activeCanvas && (
          <CanvasView
            canvas={activeCanvas}
            nodes={toFlowNodes(activeCanvas.nodes)}
            edges={toFlowEdges(activeCanvas.edges)}
            onNodeDragStop={onCanvasNodeDragStop}
            onEdgesChange={onCanvasEdgesChange}
            onSelectNode={setSelectedNodeId}
          />
        )}

        {view === 'notes' && activeNote && (
          <NotesView
            notes={notes}
            activeNote={activeNote}
            onSelectNote={setSelectedNoteId}
            onUpdateNote={(note) => updateNote(note.id, () => note)}
          />
        )}

        <footer className="statusbar">
          <span>{workspacePath}</span>
          <span>{data.updatedAt ? new Date(data.updatedAt).toLocaleString() : ''}</span>
        </footer>
      </section>

      <aside className="inspector">
        <Inspector
          view={view}
          selectedCard={selectedCard}
          selectedNode={selectedNode}
          activeNote={activeNote}
          notes={data.notes}
        />
      </aside>
    </main>
  )
}

function BoardView({
  board,
  selectedCardId,
  onSelectCard,
  onDragStart,
  onDropColumn,
}: {
  board: Board
  selectedCardId: string | null
  onSelectCard: (id: string) => void
  onDragStart: (id: string) => void
  onDropColumn: (columnId: string) => void
}) {
  return (
    <div className="board-grid">
      {board.columns.map((column) => {
        const cards = board.cards.filter((card) => card.columnId === column.id)

        return (
          <section
            className="kanban-column"
            key={column.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => onDropColumn(column.id)}
          >
            <header>
              <h2>{column.title}</h2>
              <span>{cards.length}</span>
            </header>
            <div className="card-stack">
              {cards.map((card) => (
                <article
                  className={card.id === selectedCardId ? 'work-card selected' : 'work-card'}
                  draggable
                  key={card.id}
                  onClick={() => onSelectCard(card.id)}
                  onDragStart={() => onDragStart(card.id)}
                >
                  <h3>{card.title}</h3>
                  <p>{card.summary}</p>
                  <div className="tag-row">
                    {card.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function CanvasView({
  canvas,
  nodes,
  edges,
  onNodeDragStop,
  onEdgesChange,
  onSelectNode,
}: {
  canvas: IdeaCanvas
  nodes: Node[]
  edges: Edge[]
  onNodeDragStop: (node: Node) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onSelectNode: (id: string) => void
}) {
  return (
    <div className="canvas-surface">
      <ReactFlow
        key={canvas.id}
        nodes={nodes}
        edges={edges}
        defaultViewport={{ x: 70, y: 90, zoom: 0.82 }}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={(_, node) => onNodeDragStop(node)}
        onNodeClick={(_, node) => onSelectNode(node.id)}
      >
        <Background color="#d7d2c7" gap={22} />
        <MiniMap zoomable pannable />
        <Controls />
      </ReactFlow>
      <div className="canvas-caption">
        <GitBranch size={15} />
        {canvas.nodes.length} Nodes, {canvas.edges.length} Verbindungen
      </div>
    </div>
  )
}

function NotesView({
  notes,
  activeNote,
  onSelectNote,
  onUpdateNote,
}: {
  notes: NoteDoc[]
  activeNote: NoteDoc
  onSelectNote: (id: string) => void
  onUpdateNote: (note: NoteDoc) => void
}) {
  return (
    <div className="notes-layout">
      <nav className="note-list" aria-label="Markdown-Notizen">
        {notes.map((note) => (
          <button
            className={note.id === activeNote.id ? 'active' : ''}
            key={note.id}
            onClick={() => onSelectNote(note.id)}
          >
            <strong>{note.title}</strong>
            <span>{note.path}</span>
          </button>
        ))}
      </nav>
      <section className="markdown-editor">
        <textarea
          value={activeNote.content}
          onChange={(event) =>
            onUpdateNote({ ...activeNote, content: event.target.value })
          }
        />
      </section>
      <article className="markdown-preview">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeNote.content}</ReactMarkdown>
      </article>
    </div>
  )
}

function Inspector({
  view,
  selectedCard,
  selectedNode,
  activeNote,
  notes,
}: {
  view: ViewMode
  selectedCard: BoardCard | null
  selectedNode: CanvasNode | null
  activeNote: NoteDoc | null
  notes: NoteDoc[]
}) {
  if (view === 'board' && selectedCard) {
    const linkedNotes = notes.filter((note) => selectedCard.noteIds.includes(note.id))

    return (
      <section>
        <span className="eyebrow">Karte</span>
        <h2>{selectedCard.title}</h2>
        <p>{selectedCard.summary}</p>
        <DetailList
          items={[
            ['Status', selectedCard.columnId],
            ['Tags', selectedCard.tags.join(', ') || '-'],
            ['Notizen', linkedNotes.map((note) => note.title).join(', ') || '-'],
          ]}
        />
      </section>
    )
  }

  if (view === 'canvas' && selectedNode) {
    return (
      <section>
        <span className="eyebrow">Canvas Node</span>
        <h2>{selectedNode.title}</h2>
        <p>{selectedNode.body}</p>
        <DetailList
          items={[
            ['Typ', selectedNode.kind],
            ['Position', `${Math.round(selectedNode.x)}, ${Math.round(selectedNode.y)}`],
            ['Refs', selectedNode.refs.map((ref) => `${ref.kind}:${ref.id}`).join(', ') || '-'],
          ]}
        />
      </section>
    )
  }

  if (view === 'notes' && activeNote) {
    return (
      <section>
        <span className="eyebrow">Markdown</span>
        <h2>{activeNote.title}</h2>
        <p>{activeNote.path}</p>
        <DetailList
          items={[
            ['Tags', activeNote.tags.join(', ') || '-'],
            ['Zeichen', String(activeNote.content.length)],
            ['Links', activeNote.linkedResourceIds.length.toString()],
          ]}
        />
      </section>
    )
  }

  return (
    <section>
      <span className="eyebrow">Inspector</span>
      <h2>Nichts ausgewaehlt</h2>
      <p>Waehle eine Karte, einen Node oder eine Notiz aus.</p>
    </section>
  )
}

function DetailList({ items }: { items: [string, string][] }) {
  return (
    <dl className="detail-list">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function toFlowNodes(nodes: CanvasNode[]): Node[] {
  return nodes.map((node) => ({
    id: node.id,
    position: { x: node.x, y: node.y },
    data: {
      label: (
        <div className={`flow-node flow-node-${node.kind}`}>
          <strong>{node.title}</strong>
          <span>{node.body}</span>
        </div>
      ),
    },
    style: {
      background: '#ffffff',
      border: '1px solid #d7dbe2',
      borderRadius: 8,
      boxShadow: '0 8px 18px rgb(17 24 39 / 0.08)',
      padding: 10,
      width: 218,
    },
    type: 'default',
  }))
}

function toFlowEdges(edges: CanvasEdge[]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    animated: edge.label === 'Reveal',
  }))
}

function getViewTitle(
  view: ViewMode,
  board?: Board,
  canvas?: IdeaCanvas,
  note?: NoteDoc | null,
) {
  if (view === 'board') {
    return board?.title ?? 'Board'
  }
  if (view === 'canvas') {
    return canvas?.title ?? 'Canvas'
  }
  return note?.title ?? 'Markdown'
}

function getViewDescription(
  view: ViewMode,
  board?: Board,
  canvas?: IdeaCanvas,
  note?: NoteDoc | null,
) {
  if (view === 'board') {
    return board?.description ?? 'Posting-Pipeline'
  }
  if (view === 'canvas') {
    return canvas?.description ?? 'Freie visuelle Planung'
  }
  return note?.path ?? 'Skripte und freie Notizen'
}

export default App
