import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type Viewport,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { nanoid } from 'nanoid'
import {
  ArrowLeftRight,
  BookMarked,
  ChevronDown,
  ChevronRight,
  FileText,
  Hand,
  Image as ImageIcon,
  LayoutGrid,
  Link as LinkIcon,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  RefreshCw,
  Square,
  Trash2,
  Type,
  Undo2,
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
  ItemKind,
  PlannerData,
  ProjectId,
  ViewMode,
} from './types'
import './App.css'

type PageMode = MarkdownMode
type CategoryId = 'canvas' | 'board' | 'skripte' | 'referenzen'
type CanvasTool =
  | 'select'
  | 'hand'
  | 'rect'
  | 'text'
  | 'link'
  | 'image-card'
  | 'image'

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

function App() {
  const [data, setData] = useState<PlannerData | null>(null)
  const [workspacePath, setWorkspacePath] = useState('')
  const [activeProjectId, setActiveProjectId] = useState<ProjectId | null>(null)
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null)
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null)
  const [activeItemId, setActiveItemId] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('canvas')
  const [expandedCategories, setExpandedCategories] = useState<
    Record<CategoryId, boolean>
  >({ canvas: true, board: false, skripte: false, referenzen: false })
  const [projectDetailOpen, setProjectDetailOpen] = useState(true)
  const [pageMode, setPageMode] = useState<PageMode>('write')
  const [rightOpen, setRightOpen] = useState(false)
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null)
  const [hideDone, setHideDone] = useState(false)
  const [saveState, setSaveState] = useState('bereit')
  const [canvasTool, setCanvasTool] = useState<CanvasTool>('select')
  const saveTimer = useRef<number | null>(null)
  const statusTimer = useRef<number | null>(null)

  useEffect(() => {
    void Promise.all([loadPlanner(), getWorkspacePath()]).then(
      ([planner, path]) => {
        setData(planner)
        setWorkspacePath(path)
        const firstProject = planner.projects[0]
        if (firstProject) {
          setActiveProjectId(firstProject.id)
          const canvas = planner.canvases.find(
            (c) => c.projectId === firstProject.id,
          )
          const board = planner.boards.find(
            (b) => b.projectId === firstProject.id,
          )
          setActiveCanvasId(canvas?.id ?? null)
          setActiveBoardId(board?.id ?? null)
        }
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

  const activeProject = data?.projects.find(
    (project) => project.id === activeProjectId,
  )

  const projectCanvases = useMemo(
    () =>
      data?.canvases.filter((canvas) => canvas.projectId === activeProjectId) ??
      [],
    [data, activeProjectId],
  )
  const projectBoards = useMemo(
    () =>
      data?.boards.filter((board) => board.projectId === activeProjectId) ?? [],
    [data, activeProjectId],
  )
  const projectScripts = useMemo(
    () =>
      data?.items.filter(
        (item) => item.projectId === activeProjectId && item.kind === 'script',
      ) ?? [],
    [data, activeProjectId],
  )
  const projectReferences = useMemo(
    () =>
      data?.items.filter(
        (item) =>
          item.projectId === activeProjectId && item.kind === 'reference',
      ) ?? [],
    [data, activeProjectId],
  )

  const activeBoard =
    projectBoards.find((board) => board.id === activeBoardId) ??
    projectBoards[0] ??
    null
  const activeCanvas =
    projectCanvases.find((canvas) => canvas.id === activeCanvasId) ??
    projectCanvases[0] ??
    null
  const activeItem =
    data?.items.find((item) => item.id === activeItemId) ?? null
  const relatedLinks =
    data?.links.filter(
      (link) =>
        activeItem &&
        (link.fromItemId === activeItem.id || link.toItemId === activeItem.id),
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

  function updateCanvas(
    canvasId: string,
    updater: (canvas: IdeaCanvas) => IdeaCanvas,
  ) {
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
    if (!data) {
      return
    }
    setActiveProjectId(projectId)
    const canvas = data.canvases.find((c) => c.projectId === projectId)
    const board = data.boards.find((b) => b.projectId === projectId)
    setActiveCanvasId(canvas?.id ?? null)
    setActiveBoardId(board?.id ?? null)
    setActiveItemId(null)
  }

  function toggleCategory(category: CategoryId) {
    setExpandedCategories((current) => ({
      ...current,
      [category]: !current[category],
    }))
  }

  function openCanvas(canvasId: string) {
    setActiveCanvasId(canvasId)
    setView('canvas')
  }

  function openBoard(boardId: string) {
    setActiveBoardId(boardId)
    setView('board')
  }

  function openScript(itemId: string) {
    setActiveItemId(itemId)
    setView('page')
  }

  function addProject() {
    if (!data) {
      return
    }

    const palette = [
      '#2563eb',
      '#0f766e',
      '#b45309',
      '#6d5dfc',
      '#be185d',
      '#047857',
    ]
    const accent = palette[data.projects.length % palette.length]
    const name = `Projekt ${data.projects.length + 1}`
    const id = `project-${nanoid(6)}`
    commit({
      ...data,
      projects: [...data.projects, { id, name, accent, description: '' }],
    })
    setActiveProjectId(id)
    setActiveCanvasId(null)
    setActiveBoardId(null)
    setActiveItemId(null)
  }

  function addCanvas() {
    if (!data || !activeProject) {
      return
    }

    const id = `canvas-${nanoid(6)}`
    const count = projectCanvases.length + 1
    const canvas: IdeaCanvas = {
      id,
      title: `Canvas ${count}`,
      projectId: activeProject.id,
      nodes: [],
      edges: [],
    }
    commit({ ...data, canvases: [...data.canvases, canvas] })
    setActiveCanvasId(id)
    setView('canvas')
  }

  function addBoard() {
    if (!data || !activeProject) {
      return
    }

    const id = `board-${nanoid(6)}`
    const count = projectBoards.length + 1
    const board: Board = {
      id,
      title: `Board ${count}`,
      projectId: activeProject.id,
      columns: [
        { id: `col-${nanoid(5)}`, title: 'Planung' },
        { id: `col-${nanoid(5)}`, title: 'In Arbeit' },
        { id: `col-${nanoid(5)}`, title: 'Fertig' },
      ],
      cards: [],
    }
    commit({ ...data, boards: [...data.boards, board] })
    setActiveBoardId(id)
    setView('board')
  }

  function buildItem(kind: ItemKind, title: string): Item {
    const now = new Date().toISOString()
    const id = `item-${nanoid(8)}`
    return {
      id,
      projectId: activeProjectId ?? '',
      title,
      summary: '',
      contentPath: `pages/${slugify(`${activeProjectId}-${title}-${nanoid(4)}`)}.md`,
      content: `# ${title}\n\n`,
      tags: [],
      kind,
      status: 'planung',
      done: false,
      createdAt: now,
      updatedAt: now,
    }
  }

  function addScript() {
    if (!data || !activeProject) {
      return
    }
    const item = buildItem('script', 'Neues Skript')
    commit({ ...data, items: [item, ...data.items] })
    setActiveItemId(item.id)
    setView('page')
    setPageMode('write')
  }

  function addReference() {
    if (!data || !activeProject) {
      return
    }
    const item = buildItem('reference', 'Neue Referenz')
    commit({ ...data, items: [item, ...data.items] })
    setActiveItemId(item.id)
    setView('page')
    setPageMode('write')
  }

  function deleteActiveItem() {
    if (!data || !activeItem) {
      return
    }

    commit({
      ...data,
      items: data.items.filter((item) => item.id !== activeItem.id),
      boards: data.boards.map((board) => ({
        ...board,
        cards: board.cards.filter((card) => card.itemId !== activeItem.id),
      })),
      canvases: data.canvases.map((canvas) => {
        const removedNodeIds = canvas.nodes
          .filter((node) => node.itemId === activeItem.id)
          .map((node) => node.id)
        return {
          ...canvas,
          nodes: canvas.nodes.filter((node) => node.itemId !== activeItem.id),
          edges: canvas.edges.filter(
            (edge) =>
              !removedNodeIds.includes(edge.source) &&
              !removedNodeIds.includes(edge.target),
          ),
        }
      }),
      links: data.links.filter(
        (link) =>
          link.fromItemId !== activeItem.id && link.toItemId !== activeItem.id,
      ),
    })
    setActiveItemId(null)
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
      columns: [
        ...board.columns,
        { id: `spalte-${nanoid(5)}`, title: 'Neue Spalte' },
      ],
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

    const fallbackColumn = activeBoard.columns.find(
      (column) => column.id !== columnId,
    )
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

  /** Add a board card that references an existing item. */
  function addBoardCardForItem(columnId: string, itemId: string) {
    if (!activeBoard) {
      return
    }
    if (activeBoard.cards.some((card) => card.itemId === itemId)) {
      return
    }
    updateBoard(activeBoard.id, (board) => ({
      ...board,
      cards: [
        ...board.cards,
        { id: `card-${nanoid(8)}`, itemId, columnId },
      ],
    }))
  }

  /** Create a brand new script item and add it as a board card. */
  function addBoardCardAsNewScript(columnId: string, title: string) {
    if (!data || !activeBoard) {
      return
    }
    const item = buildItem('script', title)
    commit({
      ...data,
      items: [item, ...data.items],
      boards: data.boards.map((board) =>
        board.id === activeBoard.id
          ? {
              ...board,
              cards: [
                ...board.cards,
                { id: `card-${nanoid(8)}`, itemId: item.id, columnId },
              ],
            }
          : board,
      ),
    })
  }

  function addCanvasNodeForItem(itemId: string) {
    if (!activeCanvas) {
      return
    }
    if (activeCanvas.nodes.some((node) => node.itemId === itemId)) {
      return
    }
    updateCanvas(activeCanvas.id, (canvas) => ({
      ...canvas,
      nodes: [
        ...canvas.nodes,
        {
          id: `node-${nanoid(8)}`,
          itemId,
          x: 150 + canvas.nodes.length * 36,
          y: 140 + canvas.nodes.length * 32,
          width: 240,
        },
      ],
    }))
  }

  function addCanvasNodeAsNewScript(title: string) {
    if (!data || !activeCanvas) {
      return
    }
    const item = buildItem('script', title)
    commit({
      ...data,
      items: [item, ...data.items],
      canvases: data.canvases.map((canvas) =>
        canvas.id === activeCanvas.id
          ? {
              ...canvas,
              nodes: [
                ...canvas.nodes,
                {
                  id: `node-${nanoid(8)}`,
                  itemId: item.id,
                  x: 150 + canvas.nodes.length * 36,
                  y: 140 + canvas.nodes.length * 32,
                  width: 240,
                },
              ],
            }
          : canvas,
      ),
    })
  }

  /** Promote a canvas-only item to a full script and open its page. */
  function openNodeAsScript(itemId: string) {
    if (!data) {
      return
    }
    const item = data.items.find((entry) => entry.id === itemId)
    if (!item) {
      return
    }
    if (item.kind !== 'script') {
      updateItem(itemId, (entry) => ({ ...entry, kind: 'script' }))
    }
    setActiveItemId(itemId)
    setView('page')
    setPageMode('write')
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

  const projectItemsForSearch = data.items.filter(
    (item) => item.projectId === activeProject.id,
  )

  return (
    <main
      className={[
        'app-shell',
        `view-${view}`,
        rightOpen ? 'right-open' : 'right-closed',
      ].join(' ')}
    >
      <div className="titlebar-drag" />

      <aside className="sidebar">
        <div className="sidebar-scroll">
          <div className="sidebar-brand">
            <span className="brand-mark" aria-hidden>
              <LayoutGrid size={14} />
            </span>
            <strong>Tisch</strong>
          </div>

          <section className="sidebar-section">
            <div className="sidebar-heading">Projekte</div>
            <nav className="project-list" aria-label="Projekte">
              {data.projects.map((project) => {
                const isActive = project.id === activeProjectId
                return (
                  <button
                    className={isActive ? 'project-row active' : 'project-row'}
                    key={project.id}
                    onClick={() => switchProject(project.id)}
                    style={
                      {
                        '--project-accent': project.accent,
                      } as React.CSSProperties
                    }
                  >
                    <span className="project-dot" aria-hidden />
                    <span className="project-name">{project.name}</span>
                    {isActive && (
                      <RefreshCw
                        className="project-sync"
                        size={12}
                        aria-hidden
                      />
                    )}
                  </button>
                )
              })}
              <button className="project-row add-row" onClick={addProject}>
                <Plus size={14} aria-hidden />
                <span>Neues Projekt</span>
              </button>
            </nav>
          </section>

          <section className="sidebar-section project-detail">
            <button
              className="project-detail-header"
              onClick={() => setProjectDetailOpen((open) => !open)}
            >
              <span>{activeProject.name}</span>
              {projectDetailOpen ? (
                <ChevronDown size={14} aria-hidden />
              ) : (
                <ChevronRight size={14} aria-hidden />
              )}
            </button>

            {projectDetailOpen && (
              <div className="category-list">
                <CategorySection
                  id="canvas"
                  label="Canvas"
                  icon={LayoutGrid}
                  expanded={expandedCategories.canvas}
                  onToggle={() => toggleCategory('canvas')}
                  onAdd={addCanvas}
                  addLabel="Neues Canvas"
                  emptyHint="Noch kein Canvas."
                  entries={projectCanvases.map((canvas) => ({
                    id: canvas.id,
                    label: canvas.title,
                    active: view === 'canvas' && canvas.id === activeCanvas?.id,
                    onClick: () => openCanvas(canvas.id),
                  }))}
                />

                <CategorySection
                  id="board"
                  label="Ideen Board"
                  icon={LayoutGrid}
                  expanded={expandedCategories.board}
                  onToggle={() => toggleCategory('board')}
                  onAdd={addBoard}
                  addLabel="Neues Board"
                  emptyHint="Noch kein Board."
                  entries={projectBoards.map((board) => ({
                    id: board.id,
                    label: board.title,
                    active: view === 'board' && board.id === activeBoard?.id,
                    onClick: () => openBoard(board.id),
                  }))}
                />

                <CategorySection
                  id="skripte"
                  label="Skripte"
                  icon={FileText}
                  expanded={expandedCategories.skripte}
                  onToggle={() => toggleCategory('skripte')}
                  onAdd={addScript}
                  addLabel="Neues Skript"
                  emptyHint="Noch keine Skripte."
                  entries={projectScripts.map((item) => ({
                    id: item.id,
                    label: item.title,
                    active: view === 'page' && item.id === activeItem?.id,
                    onClick: () => openScript(item.id),
                  }))}
                />

                <CategorySection
                  id="referenzen"
                  label="Referenzen"
                  icon={BookMarked}
                  expanded={expandedCategories.referenzen}
                  onToggle={() => toggleCategory('referenzen')}
                  onAdd={addReference}
                  addLabel="Neue Referenz"
                  emptyHint="Noch keine Referenzen."
                  entries={projectReferences.map((item) => ({
                    id: item.id,
                    label: item.title,
                    active: view === 'page' && item.id === activeItem?.id,
                    onClick: () => openScript(item.id),
                  }))}
                />
              </div>
            )}
          </section>
        </div>
      </aside>

      <section className="workspace">
        {view === 'page' && activeItem && (
          <PageView
            item={activeItem}
            pageMode={pageMode}
            saveState={saveState}
            onDelete={deleteActiveItem}
            onModeChange={setPageMode}
            onUpdate={(item) => updateItem(item.id, () => item)}
            onToggleInspector={() => setRightOpen(!rightOpen)}
          />
        )}

        {view === 'page' && !activeItem && (
          <EmptyView
            title="Keine Seite ausgewählt"
            description="Öffne ein Skript oder eine Referenz aus der Seitenleiste."
          />
        )}

        {view === 'canvas' && activeCanvas && (
          <ReactFlowProvider>
            <CanvasView
              canvas={activeCanvas}
              items={data.items}
              edges={toFlowEdges(activeCanvas.edges)}
              canvasTool={canvasTool}
              onToolChange={setCanvasTool}
              onNodeDragStop={onCanvasNodeDragStop}
              onEdgesChange={onCanvasEdgesChange}
              onConnect={onCanvasConnect}
              onOpenNode={openNodeAsScript}
              onAddExistingItem={addCanvasNodeForItem}
              onCreateNodeScript={addCanvasNodeAsNewScript}
              projectItems={projectItemsForSearch}
              inspectorOpen={rightOpen}
              onToggleInspector={() => setRightOpen(!rightOpen)}
            />
          </ReactFlowProvider>
        )}

        {view === 'canvas' && !activeCanvas && (
          <EmptyView
            title="Kein Canvas"
            description="Lege in der Seitenleiste ein neues Canvas an."
            actionLabel="Neues Canvas"
            onAction={addCanvas}
          />
        )}

        {view === 'board' && activeBoard && (
          <BoardView
            board={activeBoard}
            items={data.items}
            projectItems={projectItemsForSearch}
            hideDone={hideDone}
            selectedItemId={activeItem?.id ?? null}
            onSelectItem={openScript}
            onDragStart={setDraggedCardId}
            onDropColumn={moveCard}
            onAddColumn={addColumn}
            onRenameColumn={renameColumn}
            onDeleteColumn={deleteColumn}
            onAddExistingToColumn={addBoardCardForItem}
            onCreateCardInColumn={addBoardCardAsNewScript}
            onToggleDone={(itemId) =>
              updateItem(itemId, (item) => ({ ...item, done: !item.done }))
            }
            onToggleHideDone={() => setHideDone(!hideDone)}
          />
        )}

        {view === 'board' && !activeBoard && (
          <EmptyView
            title="Kein Board"
            description="Lege in der Seitenleiste ein neues Ideen Board an."
            actionLabel="Neues Board"
            onAction={addBoard}
          />
        )}
      </section>

      {rightOpen && (
        <aside className="right-pane">
          <Inspector
            item={activeItem}
            view={view}
            links={relatedLinks}
            items={data.items}
            board={activeBoard}
            canvas={activeCanvas}
          />
        </aside>
      )}

      <footer className="statusbar">
        <span>{workspacePath}</span>
        <span>
          {data.updatedAt ? new Date(data.updatedAt).toLocaleString() : ''}
        </span>
      </footer>
    </main>
  )
}

/* ------------------------------------------------------------------ */
/* Sidebar                                                             */
/* ------------------------------------------------------------------ */

function CategorySection({
  label,
  icon: Icon,
  expanded,
  entries,
  emptyHint,
  addLabel,
  onToggle,
  onAdd,
}: {
  id: CategoryId
  label: string
  icon: typeof LayoutGrid
  expanded: boolean
  entries: {
    id: string
    label: string
    active: boolean
    onClick: () => void
  }[]
  emptyHint: string
  addLabel: string
  onToggle: () => void
  onAdd: () => void
}) {
  const Chevron = expanded ? ChevronDown : ChevronRight
  return (
    <div className="category-block">
      <button
        className={expanded ? 'category-row active' : 'category-row'}
        onClick={onToggle}
      >
        <Chevron className="category-chevron" size={13} aria-hidden />
        <Icon className="category-icon" size={14} aria-hidden />
        <span>{label}</span>
      </button>

      {expanded && (
        <div className="page-list">
          {entries.length === 0 && (
            <span className="page-empty">{emptyHint}</span>
          )}
          {entries.map((entry) => (
            <button
              className={entry.active ? 'page-row active' : 'page-row'}
              key={entry.id}
              onClick={entry.onClick}
            >
              <FileText size={13} aria-hidden />
              <span>{entry.label}</span>
            </button>
          ))}
          <button className="page-row add-row" onClick={onAdd}>
            <Plus size={13} aria-hidden />
            <span>{addLabel}</span>
          </button>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Empty state                                                         */
/* ------------------------------------------------------------------ */

function EmptyView({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="empty-view">
      <h2>{title}</h2>
      <p>{description}</p>
      {actionLabel && onAction && (
        <button className="empty-action" onClick={onAction}>
          <Plus size={15} />
          {actionLabel}
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page view                                                           */
/* ------------------------------------------------------------------ */

function PageView({
  item,
  pageMode,
  saveState,
  onDelete,
  onModeChange,
  onUpdate,
  onToggleInspector,
}: {
  item: Item
  pageMode: PageMode
  saveState: string
  onDelete: () => void
  onModeChange: (mode: PageMode) => void
  onUpdate: (item: Item) => void
  onToggleInspector: () => void
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
      <div className="page-header">
        <input
          className="title-input"
          value={item.title}
          onChange={(event) => onUpdate({ ...item, title: event.target.value })}
        />
        <div className="page-actions">
          <span
            className={`save-pill ${saveState === 'bereit' ? 'is-idle' : ''}`}
          >
            {saveState}
          </span>
          <button className="icon-button" onClick={onDelete} title="Löschen">
            <Trash2 size={15} />
          </button>
          <button
            className="icon-button"
            onClick={onToggleInspector}
            title="Inspector"
          >
            <ArrowLeftRight size={15} />
          </button>
        </div>
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

/* ------------------------------------------------------------------ */
/* Canvas view                                                         */
/* ------------------------------------------------------------------ */

function CanvasView({
  canvas,
  items,
  edges,
  canvasTool,
  onToolChange,
  onNodeDragStop,
  onEdgesChange,
  onConnect,
  onOpenNode,
  onAddExistingItem,
  onCreateNodeScript,
  projectItems,
  inspectorOpen,
  onToggleInspector,
}: {
  canvas: IdeaCanvas
  items: Item[]
  edges: Edge[]
  canvasTool: CanvasTool
  onToolChange: (tool: CanvasTool) => void
  onNodeDragStop: (node: Node) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  onOpenNode: (itemId: string) => void
  onAddExistingItem: (itemId: string) => void
  onCreateNodeScript: (title: string) => void
  projectItems: Item[]
  inspectorOpen: boolean
  onToggleInspector: () => void
}) {
  const [showGrid, setShowGrid] = useState(true)
  const [addOpen, setAddOpen] = useState(false)

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
  const flowNodes =
    flowState.sourceKey === sourceKey ? flowState.nodes : sourceNodes
  const panOnDrag = canvasTool === 'hand'

  const takenItemIds = new Set(canvas.nodes.map((node) => node.itemId))
  const availableItems = projectItems.filter((item) => !takenItemIds.has(item.id))

  return (
    <section className="canvas-view">
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
              entry.id === node.id
                ? { ...entry, position: node.position }
                : entry,
            ),
          }))
          onNodeDragStop(node)
        }}
        onNodeDoubleClick={(_, node) => onOpenNode(String(node.data.itemId))}
        panOnDrag={panOnDrag}
        nodesDraggable={canvasTool === 'select'}
        panOnScroll={panOnDrag}
        proOptions={{ hideAttribution: true }}
      >
        {showGrid && <Background color="#d7d9df" gap={24} />}
      </ReactFlow>

      <CanvasToolbar
        tool={canvasTool}
        onToolChange={onToolChange}
        onOpenAdd={() => setAddOpen(true)}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid((value) => !value)}
        inspectorOpen={inspectorOpen}
        onToggleInspector={onToggleInspector}
      />

      <CanvasHistoryControls />

      {addOpen && (
        <ItemPickerDialog
          title="Objekt zum Canvas hinzufügen"
          placeholder="Titel suchen oder neu erstellen…"
          items={availableItems}
          onSelectExisting={(id) => {
            onAddExistingItem(id)
            setAddOpen(false)
          }}
          onCreateNew={(title) => {
            onCreateNodeScript(title)
            setAddOpen(false)
          }}
          onClose={() => setAddOpen(false)}
        />
      )}
    </section>
  )
}

function CanvasToolbar({
  tool,
  onToolChange,
  onOpenAdd,
  showGrid,
  onToggleGrid,
  inspectorOpen,
  onToggleInspector,
}: {
  tool: CanvasTool
  onToolChange: (tool: CanvasTool) => void
  onOpenAdd: () => void
  showGrid: boolean
  onToggleGrid: () => void
  inspectorOpen: boolean
  onToggleInspector: () => void
}) {
  const { zoomIn, zoomOut, getViewport, setViewport } = useReactFlow()
  const [zoom, setZoom] = useState(100)

  useEffect(() => {
    const id = window.setInterval(() => {
      const vp = getViewport()
      setZoom(Math.round(vp.zoom * 100))
    }, 200)
    return () => window.clearInterval(id)
  }, [getViewport])

  const tools: { id: CanvasTool; Icon: typeof MousePointer2; label: string }[] =
    [
      { id: 'select', Icon: MousePointer2, label: 'Auswählen' },
      { id: 'hand', Icon: Hand, label: 'Hand' },
      { id: 'rect', Icon: Square, label: 'Rechteck' },
      { id: 'text', Icon: Type, label: 'Text' },
      { id: 'link', Icon: LinkIcon, label: 'Verknüpfung' },
      { id: 'image-card', Icon: ImageIcon, label: 'Karte / Objekt hinzufügen' },
      { id: 'image', Icon: ImageIcon, label: 'Bild' },
    ]

  function resetView() {
    const vp: Viewport = getViewport()
    setViewport({ ...vp, zoom: 1 })
  }

  return (
    <>
      <div className="canvas-tool-pill" role="toolbar" aria-label="Werkzeuge">
        {tools.map(({ id, Icon, label }) => (
          <button
            key={id}
            className={tool === id ? 'tool-button active' : 'tool-button'}
            onClick={() => {
              if (id === 'image-card') {
                onOpenAdd()
              }
              onToolChange(id)
            }}
            title={label}
          >
            <Icon size={16} />
          </button>
        ))}
      </div>

      <div className="canvas-zoom" role="group" aria-label="Zoom">
        <button className="zoom-button" onClick={() => zoomOut()} title="Kleiner">
          <Minus size={14} />
        </button>
        <button
          className="zoom-value"
          onClick={resetView}
          title="Zoom zurücksetzen"
        >
          {zoom}%
        </button>
        <button className="zoom-button" onClick={() => zoomIn()} title="Größer">
          <Plus size={14} />
        </button>
      </div>

      <div className="canvas-aux" role="group" aria-label="Ansicht">
        <button
          className={showGrid ? 'aux-button active' : 'aux-button'}
          onClick={onToggleGrid}
          title={showGrid ? 'Raster ausblenden' : 'Raster einblenden'}
        >
          <LayoutGrid size={15} />
        </button>
        <button
          className={inspectorOpen ? 'aux-button active' : 'aux-button'}
          onClick={onToggleInspector}
          title="Inspector umschalten"
        >
          <ArrowLeftRight size={15} />
        </button>
      </div>
    </>
  )
}

function CanvasHistoryControls() {
  return (
    <div className="canvas-history" role="group" aria-label="Verlauf">
      <button className="history-button" title="Rückgängig (bald)" disabled>
        <Undo2 size={15} />
      </button>
      <button className="history-button" title="Wiederholen (bald)" disabled>
        <Redo2 size={15} />
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Board view                                                          */
/* ------------------------------------------------------------------ */

function BoardView({
  board,
  items,
  projectItems,
  hideDone,
  selectedItemId,
  onSelectItem,
  onDragStart,
  onDropColumn,
  onAddColumn,
  onRenameColumn,
  onDeleteColumn,
  onAddExistingToColumn,
  onCreateCardInColumn,
  onToggleDone,
  onToggleHideDone,
}: {
  board: Board
  items: Item[]
  projectItems: Item[]
  hideDone: boolean
  selectedItemId: string | null
  onSelectItem: (id: string) => void
  onDragStart: (id: string) => void
  onDropColumn: (columnId: string) => void
  onAddColumn: () => void
  onRenameColumn: (columnId: string, title: string) => void
  onDeleteColumn: (columnId: string) => void
  onAddExistingToColumn: (columnId: string, itemId: string) => void
  onCreateCardInColumn: (columnId: string, title: string) => void
  onToggleDone: (itemId: string) => void
  onToggleHideDone: () => void
}) {
  const takenItemIds = new Set(board.cards.map((card) => card.itemId))
  const candidatesForBoard = projectItems.filter(
    (item) => !takenItemIds.has(item.id),
  )

  return (
    <section className="board-view">
      <div className="board-toolbar">
        <h2>{board.title}</h2>
        <div className="board-toolbar-actions">
          <button onClick={onAddColumn}>
            <Plus size={15} />
            Spalte
          </button>
          <label>
            <input
              checked={hideDone}
              onChange={onToggleHideDone}
              type="checkbox"
            />
            Fertige ausblenden
          </label>
        </div>
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
            <BoardColumn
              key={column.id}
              column={column}
              cards={cards}
              candidates={candidatesForBoard}
              selectedItemId={selectedItemId}
              onSelectItem={onSelectItem}
              onDragStart={onDragStart}
              onDrop={() => onDropColumn(column.id)}
              onRename={(title) => onRenameColumn(column.id, title)}
              onDelete={() => onDeleteColumn(column.id)}
              onAddExisting={(itemId) =>
                onAddExistingToColumn(column.id, itemId)
              }
              onCreateNew={(title) => onCreateCardInColumn(column.id, title)}
              onToggleDone={onToggleDone}
            />
          )
        })}
      </div>
    </section>
  )
}

function BoardColumn({
  column,
  cards,
  candidates,
  selectedItemId,
  onSelectItem,
  onDragStart,
  onDrop,
  onRename,
  onDelete,
  onAddExisting,
  onCreateNew,
  onToggleDone,
}: {
  column: { id: string; title: string }
  cards: { card: { id: string; itemId: string }; item: Item | undefined }[]
  candidates: Item[]
  selectedItemId: string | null
  onSelectItem: (id: string) => void
  onDragStart: (id: string) => void
  onDrop: () => void
  onRename: (title: string) => void
  onDelete: () => void
  onAddExisting: (itemId: string) => void
  onCreateNew: (title: string) => void
  onToggleDone: (itemId: string) => void
}) {
  const [adderOpen, setAdderOpen] = useState(false)

  return (
    <section
      className="kanban-column"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <header>
        <input
          value={column.title}
          onChange={(event) => onRename(event.target.value)}
        />
        <span>{cards.length}</span>
        <button onClick={onDelete}>
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
                  <span aria-hidden>✓</span>
                </button>
              </div>
              {item.summary && <p>{item.summary}</p>}
              {item.tags.length > 0 && (
                <div className="tag-row">
                  {item.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              )}
            </article>
          ) : null,
        )}

        {adderOpen ? (
          <InlineItemPicker
            placeholder="Titel suchen oder neu erstellen…"
            items={candidates}
            onSelectExisting={(id) => {
              onAddExisting(id)
              setAdderOpen(false)
            }}
            onCreateNew={(title) => {
              onCreateNew(title)
              setAdderOpen(false)
            }}
            onCancel={() => setAdderOpen(false)}
          />
        ) : (
          <button
            className="column-add-button"
            onClick={() => setAdderOpen(true)}
          >
            <Plus size={13} />
            Karte hinzufügen
          </button>
        )}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Item picker (autocomplete)                                          */
/* ------------------------------------------------------------------ */

function InlineItemPicker({
  placeholder,
  items,
  onSelectExisting,
  onCreateNew,
  onCancel,
}: {
  placeholder: string
  items: Item[]
  onSelectExisting: (id: string) => void
  onCreateNew: (title: string) => void
  onCancel: () => void
}) {
  const [query, setQuery] = useState('')
  const trimmed = query.trim()
  const matches = trimmed
    ? items.filter((item) =>
        item.title.toLowerCase().includes(trimmed.toLowerCase()),
      )
    : items.slice(0, 6)

  return (
    <div className="item-picker" onClick={(e) => e.stopPropagation()}>
      <input
        autoFocus
        className="item-picker-input"
        placeholder={placeholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onCancel()
          }
          if (event.key === 'Enter') {
            if (matches[0]) {
              onSelectExisting(matches[0].id)
            } else if (trimmed) {
              onCreateNew(trimmed)
            }
          }
        }}
      />
      <div className="item-picker-list">
        {matches.map((item) => (
          <button
            key={item.id}
            className="item-picker-row"
            onClick={() => onSelectExisting(item.id)}
          >
            <FileText size={13} />
            <span>{item.title}</span>
            <small>
              {item.kind === 'script'
                ? 'Skript'
                : item.kind === 'reference'
                ? 'Referenz'
                : 'Canvas'}
            </small>
          </button>
        ))}
        {trimmed &&
          !matches.some(
            (item) => item.title.toLowerCase() === trimmed.toLowerCase(),
          ) && (
            <button
              className="item-picker-row create"
              onClick={() => onCreateNew(trimmed)}
            >
              <Plus size={13} />
              <span>„{trimmed}" neu anlegen</span>
            </button>
          )}
        {matches.length === 0 && !trimmed && (
          <span className="item-picker-empty">Noch keine Objekte.</span>
        )}
      </div>
    </div>
  )
}

function ItemPickerDialog(props: {
  title: string
  placeholder: string
  items: Item[]
  onSelectExisting: (id: string) => void
  onCreateNew: (title: string) => void
  onClose: () => void
}) {
  return (
    <div className="picker-overlay" onClick={props.onClose}>
      <div className="picker-dialog" onClick={(event) => event.stopPropagation()}>
        <h3>{props.title}</h3>
        <InlineItemPicker
          placeholder={props.placeholder}
          items={props.items}
          onSelectExisting={props.onSelectExisting}
          onCreateNew={props.onCreateNew}
          onCancel={props.onClose}
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Inspector                                                           */
/* ------------------------------------------------------------------ */

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
        <h2>Nichts ausgewählt</h2>
        <p>
          Wähle links ein Objekt oder klicke auf eine Karte beziehungsweise Node.
        </p>
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
      <span className="eyebrow">
        {view === 'page'
          ? item.kind === 'reference'
            ? 'Referenz'
            : 'Skript'
          : 'Objekt'}
      </span>
      <h2>{item.title}</h2>
      {item.summary && <p>{item.summary}</p>}
      <dl className="detail-list">
        <div>
          <dt>Status</dt>
          <dd>{item.status}</dd>
        </div>
        <div>
          <dt>Darstellungen</dt>
          <dd>
            {[
              item.kind === 'script'
                ? 'Skript'
                : item.kind === 'reference'
                ? 'Referenz'
                : null,
              boardCard ? 'Board-Karte' : null,
              canvasNode ? 'Canvas-Node' : null,
            ]
              .filter(Boolean)
              .join(', ') || '-'}
          </dd>
        </div>
        <div>
          <dt>Datei</dt>
          <dd>{item.contentPath}</dd>
        </div>
        <div>
          <dt>Verknüpft</dt>
          <dd>{linkedItems.map((linked) => linked.title).join(', ') || '-'}</dd>
        </div>
      </dl>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

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
            {item?.summary && <span>{item.summary}</span>}
          </div>
        ),
      },
      style: {
        background: '#ffffff',
        border: '1px solid #d9dce3',
        borderRadius: 10,
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

export default App
