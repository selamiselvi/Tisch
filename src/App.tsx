import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { nanoid } from 'nanoid'
import {
  BookOpenText,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns3,
  FileText,
  Map,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import {
  MarkdownEditor,
  type MarkdownMode,
} from './components/editor/MarkdownEditor'
import { getWorkspacePath, loadPlanner, savePlanner } from './lib/plannerApi'
import type {
  Board,
  CanvasEdge,
  CanvasNode,
  IdeaCanvas,
  Item,
  PlannerData,
  ProjectId,
  ViewMode,
} from './types'
import './App.css'

type PageMode = MarkdownMode

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

function App() {
  const [data, setData] = useState<PlannerData | null>(null)
  const [workspacePath, setWorkspacePath] = useState('')
  const [activeProjectId, setActiveProjectId] = useState<ProjectId>('launch-plan')
  const [view, setView] = useState<ViewMode>('page')
  const [pageMode, setPageMode] = useState<PageMode>('write')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null)
  const [hideDone, setHideDone] = useState(false)
  const [saveState, setSaveState] = useState('bereit')
  const saveTimer = useRef<number | null>(null)
  const statusTimer = useRef<number | null>(null)

  useEffect(() => {
    void Promise.all([loadPlanner(), getWorkspacePath()]).then(
      ([planner, path]) => {
        setData(planner)
        setWorkspacePath(path)
        setActiveProjectId(planner.projects[0]?.id ?? 'launch-plan')
        setSelectedItemId(planner.items[0]?.id ?? null)
      },
    )
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        view === 'page' &&
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 'm'
      ) {
        event.preventDefault()
        setPageMode((mode) => (mode === 'write' ? 'source' : 'write'))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [view])

  const activeProject = data?.projects.find((project) => project.id === activeProjectId)
  const projectItems = useMemo(
    () => data?.items.filter((item) => item.projectId === activeProjectId) ?? [],
    [data, activeProjectId],
  )
  const activeBoard = useMemo(
    () => data?.boards.find((board) => board.projectId === activeProjectId) ?? null,
    [data, activeProjectId],
  )
  const activeCanvas = useMemo(
    () =>
      data?.canvases.find((canvas) => canvas.projectId === activeProjectId) ?? null,
    [data, activeProjectId],
  )
  const selectedItem =
    projectItems.find((item) => item.id === selectedItemId) ?? projectItems[0] ?? null
  const relatedLinks =
    data?.links.filter(
      (link) =>
        selectedItem &&
        (link.fromItemId === selectedItem.id || link.toItemId === selectedItem.id),
    ) ?? []

  function commit(
    next: PlannerData,
    options: { quiet?: boolean; delayMs?: number } = {},
  ) {
    setData(next)
    if (!options.quiet) {
      if (statusTimer.current) {
        window.clearTimeout(statusTimer.current)
      }
      setSaveState('speichert')
    }

    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
    }

    saveTimer.current = window.setTimeout(() => {
      void savePlanner(next).then((saved) => {
        setData(saved)
        if (!options.quiet) {
          setSaveState('gespeichert')
          statusTimer.current = window.setTimeout(() => {
            setSaveState('bereit')
          }, 900)
        }
      })
    }, options.delayMs ?? 160)
  }

  function updateItem(itemId: string, updater: (item: Item) => Item) {
    if (!data) {
      return
    }

    commit({
      ...data,
      items: data.items.map((item) =>
        item.id === itemId
          ? { ...updater(item), updatedAt: new Date().toISOString() }
          : item,
      ),
    })
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

  function updateCanvasQuiet(
    canvasId: string,
    updater: (canvas: IdeaCanvas) => IdeaCanvas,
  ) {
    if (!data) {
      return
    }

    commit(
      {
        ...data,
        canvases: data.canvases.map((canvas) =>
          canvas.id === canvasId ? updater(canvas) : canvas,
        ),
      },
      { quiet: true, delayMs: 900 },
    )
  }

  function switchProject(projectId: string) {
    setActiveProjectId(projectId)
    setSelectedItemId(
      data?.items.find((item) => item.projectId === projectId)?.id ?? null,
    )
  }

  function createItem(title = 'Neue Seite'): Item {
    const now = new Date().toISOString()
    const id = `item-${nanoid(8)}`
    return {
      id,
      projectId: activeProjectId,
      title,
      summary: 'Kurzer Ausschnitt oder Gedanke.',
      contentPath: `pages/${slugify(`${activeProjectId}-${title}-${nanoid(4)}`)}.md`,
      content: `# ${title}\n\n`,
      tags: [],
      status: 'planung',
      done: false,
      createdAt: now,
      updatedAt: now,
    }
  }

  function addItemToCurrentView() {
    if (!data) {
      return
    }

    const item = createItem(view === 'board' ? 'Neue Aufgabe' : 'Neue Seite')
    const next: PlannerData = {
      ...data,
      items: [item, ...data.items],
    }

    if (view === 'board' && activeBoard) {
      next.boards = next.boards.map((board) =>
        board.id === activeBoard.id
          ? {
              ...board,
              cards: [
                {
                  id: `card-${nanoid(8)}`,
                  itemId: item.id,
                  columnId: board.columns[0]?.id ?? 'planung',
                },
                ...board.cards,
              ],
            }
          : board,
      )
    }

    if (view === 'canvas' && activeCanvas) {
      next.canvases = next.canvases.map((canvas) =>
        canvas.id === activeCanvas.id
          ? {
              ...canvas,
              nodes: [
                ...canvas.nodes,
                {
                  id: `node-${nanoid(8)}`,
                  itemId: item.id,
                  x: 120 + canvas.nodes.length * 44,
                  y: 130 + canvas.nodes.length * 36,
                  width: 240,
                },
              ],
            }
          : canvas,
      )
    }

    commit(next)
    setSelectedItemId(item.id)
    setPageMode('write')
  }

  function deleteSelectedItem() {
    if (!data || !selectedItem) {
      return
    }

    commit({
      ...data,
      items: data.items.filter((item) => item.id !== selectedItem.id),
      boards: data.boards.map((board) => ({
        ...board,
        cards: board.cards.filter((card) => card.itemId !== selectedItem.id),
      })),
      canvases: data.canvases.map((canvas) => {
        const removedNodeIds = canvas.nodes
          .filter((node) => node.itemId === selectedItem.id)
          .map((node) => node.id)
        return {
          ...canvas,
          nodes: canvas.nodes.filter((node) => node.itemId !== selectedItem.id),
          edges: canvas.edges.filter(
            (edge) =>
              !removedNodeIds.includes(edge.source) &&
              !removedNodeIds.includes(edge.target),
          ),
        }
      }),
      links: data.links.filter(
        (link) =>
          link.fromItemId !== selectedItem.id && link.toItemId !== selectedItem.id,
      ),
    })
    setSelectedItemId(null)
  }

  function moveCard(columnId: string) {
    if (!activeBoard || !draggedCardId) {
      return
    }

    const card = activeBoard.cards.find((entry) => entry.id === draggedCardId)
    updateBoard(activeBoard.id, (board) => ({
      ...board,
      cards: board.cards.map((entry) =>
        entry.id === draggedCardId ? { ...entry, columnId } : entry,
      ),
    }))

    if (card) {
      updateItem(card.itemId, (item) => ({ ...item, status: columnId }))
    }

    setDraggedCardId(null)
  }

  function addColumn() {
    if (!activeBoard) {
      return
    }

    updateBoard(activeBoard.id, (board) => ({
      ...board,
      columns: [...board.columns, { id: `spalte-${nanoid(5)}`, title: 'Neue Spalte' }],
    }))
  }

  function renameColumn(columnId: string, title: string) {
    if (!activeBoard) {
      return
    }

    updateBoard(activeBoard.id, (board) => ({
      ...board,
      columns: board.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column,
      ),
    }))
  }

  function deleteColumn(columnId: string) {
    if (!activeBoard || activeBoard.columns.length < 2) {
      return
    }

    const fallbackColumn = activeBoard.columns.find((column) => column.id !== columnId)
    updateBoard(activeBoard.id, (board) => ({
      ...board,
      columns: board.columns.filter((column) => column.id !== columnId),
      cards: board.cards.map((card) =>
        card.columnId === columnId
          ? { ...card, columnId: fallbackColumn?.id ?? board.columns[0].id }
          : card,
      ),
    }))
  }

  function addSelectedItemToCanvas() {
    if (!activeCanvas || !selectedItem) {
      addItemToCurrentView()
      return
    }

    if (activeCanvas.nodes.some((node) => node.itemId === selectedItem.id)) {
      return
    }

    updateCanvas(activeCanvas.id, (canvas) => ({
      ...canvas,
      nodes: [
        ...canvas.nodes,
        {
          id: `node-${nanoid(8)}`,
          itemId: selectedItem.id,
          x: 150 + canvas.nodes.length * 36,
          y: 140 + canvas.nodes.length * 32,
          width: 240,
        },
      ],
    }))
  }

  function onCanvasNodeDragStop(flowNode: Node) {
    if (!activeCanvas) {
      return
    }

    updateCanvasQuiet(activeCanvas.id, (canvas) => ({
      ...canvas,
      nodes: canvas.nodes.map((node) =>
        node.id === flowNode.id
          ? {
              ...node,
              x: flowNode.position?.x ?? node.x,
              y: flowNode.position?.y ?? node.y,
            }
          : node,
      ),
    }))
  }

  function onCanvasEdgesChange(changes: EdgeChange[]) {
    if (!activeCanvas) {
      return
    }

    const changed = applyEdgeChanges(changes, toFlowEdges(activeCanvas.edges))
    updateCanvas(activeCanvas.id, (canvas) => ({
      ...canvas,
      edges: changed.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
      })),
    }))
  }

  function onCanvasConnect(connection: Connection) {
    if (!activeCanvas || !connection.source || !connection.target) {
      return
    }

    const nextEdges = addEdge(
      { ...connection, id: `edge-${nanoid(8)}` },
      toFlowEdges(activeCanvas.edges),
    )
    updateCanvas(activeCanvas.id, (canvas) => ({
      ...canvas,
      edges: nextEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
      })),
    }))
  }

  if (!data || !activeProject) {
    return <main className="loading">Tisch wird geladen...</main>
  }

  return (
    <main
      className={[
        'app-shell',
        `view-${view}`,
        leftOpen ? 'left-pinned' : 'left-floating',
        rightOpen ? 'right-open' : 'right-closed',
      ].join(' ')}
    >
      <aside className="left-pane">
        <div className="left-rail">
          <button className="icon-button" onClick={() => setLeftOpen(!leftOpen)}>
            {leftOpen ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}
          </button>
          <button
            className={view === 'page' ? 'rail-button active' : 'rail-button'}
            onClick={() => setView('page')}
          >
            <FileText size={18} />
          </button>
          <button
            className={view === 'canvas' ? 'rail-button active' : 'rail-button'}
            onClick={() => setView('canvas')}
          >
            <Map size={18} />
          </button>
          <button
            className={view === 'board' ? 'rail-button active' : 'rail-button'}
            onClick={() => setView('board')}
          >
            <Columns3 size={18} />
          </button>
        </div>

        <div className="left-content">
          <div className="brand">
            <strong>Tisch</strong>
            <span>Lokaler Arbeitsraum</span>
          </div>

          <section className="sidebar-section">
            <div className="section-title">Projekte</div>
            <nav className="project-list" aria-label="Projekte">
              {data.projects.map((project) => (
                <button
                  className={project.id === activeProjectId ? 'active' : ''}
                  key={project.id}
                  onClick={() => switchProject(project.id)}
                  style={
                    { '--project-accent': project.accent } as React.CSSProperties
                  }
                >
                  <span className="project-dot" />
                  <span>
                    <strong>{project.name}</strong>
                    <small>{project.description}</small>
                  </span>
                </button>
              ))}
            </nav>
          </section>

          <section className="sidebar-section items-section">
            <div className="section-title">
              Objekte
              <button onClick={addItemToCurrentView}>
                <Plus size={14} />
              </button>
            </div>
            <div className="item-list">
              {projectItems.map((item) => (
                <button
                  className={item.id === selectedItem?.id ? 'active' : ''}
                  key={item.id}
                  onClick={() => setSelectedItemId(item.id)}
                >
                  <strong>{item.title}</strong>
                  <span>{item.summary}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </aside>

      <section className="main-pane">
        <header className="topbar">
          <div className="title-group">
            <span className="eyebrow">{activeProject.name}</span>
            <h1>{getTitle(view, selectedItem, activeCanvas, activeBoard)}</h1>
          </div>

          <div className="toolbar">
            <span className={`save-pill ${saveState === 'bereit' ? 'is-idle' : ''}`}>
              <Save size={14} />
              {saveState}
            </span>
            <button className="icon-button" onClick={addItemToCurrentView}>
              <Plus size={17} />
            </button>
            <button className="icon-button" onClick={deleteSelectedItem}>
              <Trash2 size={17} />
            </button>
            <button className="icon-button" onClick={() => setRightOpen(!rightOpen)}>
              {rightOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
            </button>
          </div>
        </header>

        <div className="view-tabs" role="tablist" aria-label="Arbeitsmodus">
          <button
            className={view === 'page' ? 'active' : ''}
            onClick={() => setView('page')}
          >
            <BookOpenText size={16} />
            Seite
          </button>
          <button
            className={view === 'canvas' ? 'active' : ''}
            onClick={() => setView('canvas')}
          >
            <Map size={16} />
            Canvas
          </button>
          <button
            className={view === 'board' ? 'active' : ''}
            onClick={() => setView('board')}
          >
            <Columns3 size={16} />
            Board
          </button>
        </div>

        {view === 'page' && selectedItem && (
          <PageView
            item={selectedItem}
            pageMode={pageMode}
            onModeChange={setPageMode}
            onUpdate={(item) => updateItem(item.id, () => item)}
          />
        )}

        {view === 'canvas' && activeCanvas && (
          <CanvasView
            canvas={activeCanvas}
            items={data.items}
            selectedItemId={selectedItem?.id ?? null}
            edges={toFlowEdges(activeCanvas.edges)}
            onAddSelectedItem={addSelectedItemToCanvas}
            onNodeDragStop={onCanvasNodeDragStop}
            onEdgesChange={onCanvasEdgesChange}
            onConnect={onCanvasConnect}
            onSelectNode={(_nodeId, itemId) => {
              setSelectedItemId(itemId)
            }}
          />
        )}

        {view === 'board' && activeBoard && (
          <BoardView
            board={activeBoard}
            items={data.items}
            hideDone={hideDone}
            selectedItemId={selectedItem?.id ?? null}
            onSelectItem={setSelectedItemId}
            onDragStart={setDraggedCardId}
            onDropColumn={moveCard}
            onAddColumn={addColumn}
            onRenameColumn={renameColumn}
            onDeleteColumn={deleteColumn}
            onToggleDone={(itemId) =>
              updateItem(itemId, (item) => ({ ...item, done: !item.done }))
            }
            onToggleHideDone={() => setHideDone(!hideDone)}
          />
        )}

        <footer className="statusbar">
          <span>{workspacePath}</span>
          <span>{data.updatedAt ? new Date(data.updatedAt).toLocaleString() : ''}</span>
        </footer>
      </section>

      {rightOpen && (
        <aside className="right-pane">
          <Inspector
            item={selectedItem}
            view={view}
            links={relatedLinks}
            items={data.items}
            board={activeBoard}
            canvas={activeCanvas}
          />
        </aside>
      )}
    </main>
  )
}

function PageView({
  item,
  pageMode,
  onModeChange,
  onUpdate,
}: {
  item: Item
  pageMode: PageMode
  onModeChange: (mode: PageMode) => void
  onUpdate: (item: Item) => void
}) {
  function updateContent(content: string) {
    onUpdate({
      ...item,
      content,
      summary: deriveSummary(content, item.summary),
    })
  }

  return (
    <section className="page-view">
      <div className="page-toolbar">
        <input
          className="title-input"
          value={item.title}
          onChange={(event) => onUpdate({ ...item, title: event.target.value })}
        />
      </div>

      <MarkdownEditor
        content={item.content}
        itemId={item.id}
        mode={pageMode}
        onChange={updateContent}
        onModeChange={onModeChange}
      />
    </section>
  )
}

function deriveSummary(markdown: string, fallback: string) {
  return (
    markdown
      .split('\n')
      .map((line) =>
        line
          .replace(/^#{1,6}\s+/, '')
          .replace(/^[-*+]\s+\[[ xX]\]\s+/, '')
          .replace(/^[-*+]\s+/, '')
          .replace(/^\d+\.\s+/, '')
          .replace(/[*_`>#]/g, '')
          .trim(),
      )
      .find(Boolean)
      ?.slice(0, 160) ?? fallback
  )
}

function CanvasView({
  canvas,
  items,
  selectedItemId,
  edges,
  onAddSelectedItem,
  onNodeDragStop,
  onEdgesChange,
  onConnect,
  onSelectNode,
}: {
  canvas: IdeaCanvas
  items: Item[]
  selectedItemId: string | null
  edges: Edge[]
  onAddSelectedItem: () => void
  onNodeDragStop: (node: Node) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  onSelectNode: (nodeId: string, itemId: string) => void
}) {
  const sourceNodes = useMemo(
    () => toFlowNodes(canvas.nodes, items),
    [canvas.nodes, items],
  )
  const sourceKey = useMemo(
    () =>
      canvas.nodes
        .map((node) => {
          const item = items.find((candidate) => candidate.id === node.itemId)
          return [
            node.id,
            node.itemId,
            node.x,
            node.y,
            node.width,
            item?.title,
            item?.summary,
            item?.imagePath,
          ].join(':')
        })
        .join('|'),
    [canvas.nodes, items],
  )
  const [flowState, setFlowState] = useState<{
    sourceKey: string
    nodes: Node[]
  }>(() => ({ sourceKey, nodes: sourceNodes }))
  const flowNodes = flowState.sourceKey === sourceKey ? flowState.nodes : sourceNodes
  const selectedAlreadyOnCanvas = canvas.nodes.some(
    (node) => node.itemId === selectedItemId,
  )

  return (
    <section className="canvas-view">
      <div className="canvas-toolbar">
        <span>
          {canvas.nodes.length} Nodes, {canvas.edges.length} Verbindungen
        </span>
        <button onClick={onAddSelectedItem} disabled={selectedAlreadyOnCanvas}>
          <Plus size={15} />
          Ausgewaehltes Objekt als Node
        </button>
      </div>
      <ReactFlow
        key={canvas.id}
        nodes={flowNodes}
        edges={edges}
        onNodesChange={(changes: NodeChange[]) =>
          setFlowState((current) => ({
            sourceKey,
            nodes: applyNodeChanges(
              changes,
              current.sourceKey === sourceKey ? current.nodes : sourceNodes,
            ),
          }))
        }
        fitView
        fitViewOptions={{ padding: 0.22 }}
        onConnect={onConnect}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={(_, node) => {
          setFlowState((current) => ({
            sourceKey,
            nodes: (current.sourceKey === sourceKey
              ? current.nodes
              : sourceNodes
            ).map((entry) =>
              entry.id === node.id ? { ...entry, position: node.position } : entry,
            ),
          }))
          onNodeDragStop(node)
        }}
        onNodeClick={(_, node) => onSelectNode(node.id, String(node.data.itemId))}
      >
        <Background color="#d7d9df" gap={24} />
        <Controls />
      </ReactFlow>
      <div className="canvas-empty-note">
        {items.length === 0 ? 'Noch keine Objekte.' : 'Nodes sind nur Ansichten deiner Objekte.'}
      </div>
    </section>
  )
}

function BoardView({
  board,
  items,
  hideDone,
  selectedItemId,
  onSelectItem,
  onDragStart,
  onDropColumn,
  onAddColumn,
  onRenameColumn,
  onDeleteColumn,
  onToggleDone,
  onToggleHideDone,
}: {
  board: Board
  items: Item[]
  hideDone: boolean
  selectedItemId: string | null
  onSelectItem: (id: string) => void
  onDragStart: (id: string) => void
  onDropColumn: (columnId: string) => void
  onAddColumn: () => void
  onRenameColumn: (columnId: string, title: string) => void
  onDeleteColumn: (columnId: string) => void
  onToggleDone: (itemId: string) => void
  onToggleHideDone: () => void
}) {
  return (
    <section className="board-view">
      <div className="board-toolbar">
        <button onClick={onAddColumn}>
          <Plus size={15} />
          Spalte
        </button>
        <label>
          <input checked={hideDone} onChange={onToggleHideDone} type="checkbox" />
          Fertige ausblenden
        </label>
      </div>
      <div className="board-grid">
        {board.columns.map((column) => {
          const cards = board.cards
            .filter((card) => card.columnId === column.id)
            .map((card) => ({
              card,
              item: items.find((item) => item.id === card.itemId),
            }))
            .filter(({ item }) => item && (!hideDone || !item.done))

          return (
            <section
              className="kanban-column"
              key={column.id}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => onDropColumn(column.id)}
            >
              <header>
                <input
                  value={column.title}
                  onChange={(event) => onRenameColumn(column.id, event.target.value)}
                />
                <span>{cards.length}</span>
                <button onClick={() => onDeleteColumn(column.id)}>
                  <Trash2 size={14} />
                </button>
              </header>
              <div className="card-stack">
                {cards.map(({ card, item }) =>
                  item ? (
                    <article
                      className={
                        item.id === selectedItemId ? 'work-card selected' : 'work-card'
                      }
                      draggable
                      key={card.id}
                      onClick={() => onSelectItem(item.id)}
                      onDragStart={() => onDragStart(card.id)}
                    >
                      <div className="card-title-row">
                        <h3>{item.title}</h3>
                        <button
                          className={item.done ? 'done-check checked' : 'done-check'}
                          onClick={(event) => {
                            event.stopPropagation()
                            onToggleDone(item.id)
                          }}
                        >
                          <Check size={13} />
                        </button>
                      </div>
                      <p>{item.summary}</p>
                      <div className="tag-row">
                        {item.tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    </article>
                  ) : null,
                )}
              </div>
            </section>
          )
        })}
      </div>
    </section>
  )
}

function Inspector({
  item,
  view,
  links,
  items,
  board,
  canvas,
}: {
  item: Item | null
  view: ViewMode
  links: PlannerData['links']
  items: Item[]
  board: Board | null
  canvas: IdeaCanvas | null
}) {
  if (!item) {
    return (
      <section className="inspector-card">
        <span className="eyebrow">Inspector</span>
        <h2>Nichts ausgewaehlt</h2>
        <p>Waehle links ein Objekt oder klicke auf eine Karte beziehungsweise Node.</p>
      </section>
    )
  }

  const boardCard = board?.cards.find((card) => card.itemId === item.id)
  const canvasNode = canvas?.nodes.find((node) => node.itemId === item.id)
  const linkedItems = links
    .map((link) =>
      items.find((candidate) =>
        candidate.id === link.fromItemId
          ? link.toItemId === item.id
          : candidate.id === link.toItemId && link.fromItemId === item.id,
      ),
    )
    .filter(Boolean) as Item[]

  return (
    <section className="inspector-card">
      <span className="eyebrow">{view === 'page' ? 'Seite' : 'Objekt'}</span>
      <h2>{item.title}</h2>
      <p>{item.summary}</p>
      <dl className="detail-list">
        <div>
          <dt>Status</dt>
          <dd>{item.status}</dd>
        </div>
        <div>
          <dt>Darstellungen</dt>
          <dd>
            {[
              'Seite',
              boardCard ? 'Board-Karte' : null,
              canvasNode ? 'Canvas-Node' : null,
            ]
              .filter(Boolean)
              .join(', ')}
          </dd>
        </div>
        <div>
          <dt>Datei</dt>
          <dd>{item.contentPath}</dd>
        </div>
        <div>
          <dt>Verknuepft</dt>
          <dd>{linkedItems.map((linked) => linked.title).join(', ') || '-'}</dd>
        </div>
      </dl>
    </section>
  )
}

function toFlowNodes(nodes: CanvasNode[], items: Item[]): Node[] {
  return nodes.map((node) => {
    const item = items.find((candidate) => candidate.id === node.itemId)

    return {
      id: node.id,
      position: { x: node.x, y: node.y },
      data: {
        itemId: node.itemId,
        label: (
          <div className="flow-node">
            {item?.imagePath && <div className="node-image-placeholder" />}
            <strong>{item?.title ?? 'Unbekanntes Objekt'}</strong>
            <span>{item?.summary ?? ''}</span>
          </div>
        ),
      },
      style: {
        background: '#ffffff',
        border: '1px solid #d9dce3',
        borderRadius: 8,
        boxShadow: '0 12px 24px rgb(15 23 42 / 0.08)',
        padding: 12,
        width: node.width ?? 240,
      },
      type: 'default',
    }
  })
}

function toFlowEdges(edges: CanvasEdge[]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
  }))
}

function getTitle(
  view: ViewMode,
  item: Item | null,
  canvas: IdeaCanvas | null,
  board: Board | null,
) {
  if (view === 'canvas') {
    return canvas?.title ?? 'Canvas'
  }
  if (view === 'board') {
    return board?.title ?? 'Board'
  }
  return item?.title ?? 'Seite'
}

export default App
