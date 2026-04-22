import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  ConnectionLineType,
  ConnectionMode,
  Handle,
  MarkerType,
  NodeResizer,
  ReactFlow,
  ReactFlowProvider,
  Position,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  reconnectEdge,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  type Viewport,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { nanoid } from 'nanoid'
import {
  ArrowUpRight,
  ArrowLeftRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  LayoutGrid,
  Minus,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import {
  MarkdownEditor,
  type MarkdownMode,
} from './components/editor/MarkdownEditor'
import brandMarkUrl from './assets/tisch-mark.svg'
import {
  getWorkspacePath,
  loadPlanner,
  pickImage,
  savePlanner,
} from './lib/plannerApi'
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
type CategoryId = 'canvas' | 'board' | 'skripte'
type CanvasEdgeStyle = 'bezier' | 'smoothstep' | 'straight'
type SidebarTargetKind = 'project' | 'canvas' | 'board' | 'script'
type SidebarMenuState = {
  kind: SidebarTargetKind
  id: string
  x: number
  y: number
}

type CanvasFlowNodeData = {
  itemId: string
  content: string
  autoFocusBody: boolean
  onUpdateContent: (itemId: string, content: string) => void
  onOpenScript: (itemId: string) => void
  onInsertImage: (
    itemId: string,
    selectionStart: number,
    selectionEnd: number,
  ) => Promise<number | null>
  onAutoFocusHandled: (itemId: string) => void
  onResize: (itemId: string, width: number, height: number) => void
  onDelete: (itemId: string) => void
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

function removeItemFromPlanner(planner: PlannerData, itemId: string) {
  return {
    ...planner,
    items: planner.items.filter((item) => item.id !== itemId),
    boards: planner.boards.map((board) => ({
      ...board,
      cards: board.cards.filter((card) => card.itemId !== itemId),
    })),
    canvases: planner.canvases.map((canvas) => {
      const removedNodeIds = canvas.nodes
        .filter((node) => node.itemId === itemId)
        .map((node) => node.id)

      return {
        ...canvas,
        nodes: canvas.nodes.filter((node) => node.itemId !== itemId),
        edges: canvas.edges.filter(
          (edge) =>
            !removedNodeIds.includes(edge.source) &&
            !removedNodeIds.includes(edge.target),
        ),
      }
    }),
    links: planner.links.filter(
      (link) => link.fromItemId !== itemId && link.toItemId !== itemId,
    ),
  }
}

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
  >({ canvas: true, board: false, skripte: false })
  const [projectDetailOpen, setProjectDetailOpen] = useState(true)
  const [pageMode, setPageMode] = useState<PageMode>('write')
  const [rightOpen, setRightOpen] = useState(false)
  const [canvasEdgeStyle, setCanvasEdgeStyle] = useState<CanvasEdgeStyle>('bezier')
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null)
  const [hideDone, setHideDone] = useState(false)
  const [sidebarMenu, setSidebarMenu] = useState<SidebarMenuState | null>(null)
  const [pendingCanvasFocusItemId, setPendingCanvasFocusItemId] = useState<
    string | null
  >(null)
  const [canvasUndoStack, setCanvasUndoStack] = useState<PlannerData[]>([])
  const [canvasRedoStack, setCanvasRedoStack] = useState<PlannerData[]>([])
  const saveTimer = useRef<number | null>(null)

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
    if (!sidebarMenu) {
      return
    }

    function closeMenu() {
      setSidebarMenu(null)
    }

    window.addEventListener('pointerdown', closeMenu)
    window.addEventListener('scroll', closeMenu, true)

    return () => {
      window.removeEventListener('pointerdown', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
    }
  }, [sidebarMenu])

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
    options: { delayMs?: number } = {},
  ) {
    setData(next)

    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
    }

    saveTimer.current = window.setTimeout(() => {
      void savePlanner(next).then((saved) => {
        setData(saved)
      })
    }, options.delayMs ?? 160)
  }

  function clonePlannerData(planner: PlannerData) {
    return JSON.parse(JSON.stringify(planner)) as PlannerData
  }

  function recordCanvasHistorySnapshot() {
    if (!data || view !== 'canvas') {
      return
    }

    const snapshot = clonePlannerData(data)
    setCanvasUndoStack((current) => [...current, snapshot].slice(-100))
    setCanvasRedoStack([])
  }

  function restoreCanvasSnapshot(snapshot: PlannerData) {
    setData(snapshot)
    void savePlanner(snapshot).then((saved) => {
      setData(saved)
    })
  }

  function undoCanvas() {
    if (!data || canvasUndoStack.length === 0) {
      return
    }

    const previous = canvasUndoStack[canvasUndoStack.length - 1]
    setCanvasUndoStack((current) => current.slice(0, -1))
    setCanvasRedoStack((current) => [...current, clonePlannerData(data)].slice(-100))
    restoreCanvasSnapshot(previous)
  }

  function redoCanvas() {
    if (!data || canvasRedoStack.length === 0) {
      return
    }

    const next = canvasRedoStack[canvasRedoStack.length - 1]
    setCanvasRedoStack((current) => current.slice(0, -1))
    setCanvasUndoStack((current) => [...current, clonePlannerData(data)].slice(-100))
    restoreCanvasSnapshot(next)
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

    recordCanvasHistorySnapshot()
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

    recordCanvasHistorySnapshot()
    commit(
      {
        ...data,
        canvases: data.canvases.map((canvas) =>
          canvas.id === canvasId ? updater(canvas) : canvas,
        ),
      },
      { delayMs: 900 },
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

  function updateProject(
    projectId: string,
    updater: (project: PlannerData['projects'][number]) => PlannerData['projects'][number],
  ) {
    if (!data) {
      return
    }

    commit({
      ...data,
      projects: data.projects.map((project) =>
        project.id === projectId ? updater(project) : project,
      ),
    })
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

  function openSidebarMenu(
    event: React.MouseEvent,
    target: { kind: SidebarTargetKind; id: string },
  ) {
    event.preventDefault()
    event.stopPropagation()
    setSidebarMenu({
      ...target,
      x: event.clientX,
      y: event.clientY,
    })
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

  function renameProject(projectId: string, name: string) {
    const nextName = name.trim()
    if (!nextName) {
      return
    }

    updateProject(projectId, (project) => ({ ...project, name: nextName }))
  }

  function deleteProject(projectId: string) {
    if (!data) {
      return
    }

    const project = data.projects.find((entry) => entry.id === projectId)
    if (!project) {
      return
    }

    const confirmed = window.confirm(
      `Projekt „${project.name}“ löschen? Alle zugehörigen Skripte, Boards und Canvas-Daten werden entfernt.`,
    )
    if (!confirmed) {
      return
    }

    const nextProjects = data.projects.filter((entry) => entry.id !== projectId)
    const nextItems = data.items.filter((item) => item.projectId !== projectId)
    const remainingItemIds = new Set(nextItems.map((item) => item.id))
    const next = {
      ...data,
      projects: nextProjects,
      items: nextItems,
      boards: data.boards.filter((board) => board.projectId !== projectId),
      canvases: data.canvases.filter((canvas) => canvas.projectId !== projectId),
      links: data.links.filter(
        (link) =>
          remainingItemIds.has(link.fromItemId) &&
          remainingItemIds.has(link.toItemId),
      ),
    }

    commit(next)

    const fallbackProjectId = nextProjects[0]?.id ?? null
    if (!fallbackProjectId) {
      setActiveProjectId(null)
      setActiveCanvasId(null)
      setActiveBoardId(null)
      setActiveItemId(null)
      setView('canvas')
      return
    }

    const fallbackCanvas = next.canvases.find(
      (canvas) => canvas.projectId === fallbackProjectId,
    )
    const fallbackBoard = next.boards.find(
      (board) => board.projectId === fallbackProjectId,
    )
    setActiveProjectId(fallbackProjectId)
    setActiveCanvasId(fallbackCanvas?.id ?? null)
    setActiveBoardId(fallbackBoard?.id ?? null)
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

  function renameCanvas(canvasId: string, title: string) {
    const nextTitle = title.trim()
    if (!nextTitle) {
      return
    }

    updateCanvas(canvasId, (canvas) => ({ ...canvas, title: nextTitle }))
  }

  function deleteCanvas(canvasId: string) {
    if (!data || !activeProject) {
      return
    }

    const canvas = data.canvases.find((entry) => entry.id === canvasId)
    if (!canvas) {
      return
    }

    const confirmed = window.confirm(`Canvas „${canvas.title}“ löschen?`)
    if (!confirmed) {
      return
    }

    const nextCanvases = data.canvases.filter((entry) => entry.id !== canvasId)
    commit({
      ...data,
      canvases: nextCanvases,
    })

    const fallbackCanvas = nextCanvases.find(
      (entry) => entry.projectId === activeProject.id,
    )
    setActiveCanvasId(fallbackCanvas?.id ?? null)
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

  function renameBoard(boardId: string, title: string) {
    const nextTitle = title.trim()
    if (!nextTitle) {
      return
    }

    updateBoard(boardId, (board) => ({ ...board, title: nextTitle }))
  }

  function deleteBoard(boardId: string) {
    if (!data || !activeProject) {
      return
    }

    const board = data.boards.find((entry) => entry.id === boardId)
    if (!board) {
      return
    }

    const confirmed = window.confirm(`Board „${board.title}“ löschen?`)
    if (!confirmed) {
      return
    }

    const nextBoards = data.boards.filter((entry) => entry.id !== boardId)
    commit({
      ...data,
      boards: nextBoards,
    })

    const fallbackBoard = nextBoards.find(
      (entry) => entry.projectId === activeProject.id,
    )
    setActiveBoardId(fallbackBoard?.id ?? null)
  }

  function buildItem(title: string): Item {
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
      kind: 'script',
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
    const item = buildItem('Neues Skript')
    commit({ ...data, items: [item, ...data.items] })
    setActiveItemId(item.id)
    setView('page')
    setPageMode('write')
  }

  function renameItem(itemId: string, title: string) {
    const nextTitle = title.trim()
    if (!nextTitle) {
      return
    }

    updateItem(itemId, (item) => ({ ...item, title: nextTitle }))
  }

  function deleteItem(itemId: string) {
    if (!data) {
      return
    }

    const itemToDelete = data.items.find((item) => item.id === itemId)
    if (!itemToDelete) {
      return
    }

    const confirmed = window.confirm(`Skript „${itemToDelete.title}“ löschen?`)
    if (!confirmed) {
      return
    }

    commit(removeItemFromPlanner(data, itemId))

    if (activeItemId === itemId) {
      setActiveItemId(null)
    }
  }

  function deleteCanvasItem(itemId: string) {
    if (!data || !activeCanvas) {
      return
    }

    recordCanvasHistorySnapshot()
    commit(removeItemFromPlanner(data, itemId))
    if (activeItemId === itemId) {
      setActiveItemId(null)
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSidebarMenu(null)
      }
      const target = event.target as HTMLElement | null
      const isEditable =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable

      if (
        event.key === 'Delete' &&
        view === 'canvas' &&
        activeCanvas &&
        activeItemId &&
        !isEditable &&
        activeCanvas.nodes.some((node) => node.itemId === activeItemId)
      ) {
        event.preventDefault()
        if (data) {
          const snapshot = JSON.parse(JSON.stringify(data)) as PlannerData
          setCanvasUndoStack((current) => [...current, snapshot].slice(-100))
          setCanvasRedoStack([])
          commit(removeItemFromPlanner(data, activeItemId))
          setActiveItemId(null)
        }
        return
      }
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
  }, [activeCanvas, activeItemId, data, view])

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
    const item = buildItem(title)
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
          width: 340,
          height: 208,
        },
      ],
    }))
  }

  function createCanvasScript(
    options: {
      title?: string
      position?: { x: number; y: number }
      focusBody?: boolean
    } = {},
  ) {
    if (!data || !activeCanvas) {
      return
    }

    const item = {
      ...buildItem(options.title ?? 'Ohne Titel'),
      content: '',
      summary: '',
    }
    const position = options.position ?? {
      x: 150 + activeCanvas.nodes.length * 36,
      y: 140 + activeCanvas.nodes.length * 32,
    }

    recordCanvasHistorySnapshot()
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
                  x: position.x,
                  y: position.y,
                  width: 340,
                  height: 208,
                },
              ],
            }
          : canvas,
      ),
    })
    setActiveItemId(item.id)
    if (options.focusBody) {
      setPendingCanvasFocusItemId(item.id)
    }
  }

  function addCanvasNodeAsNewScript(title: string) {
    createCanvasScript({ title })
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

  function updateCanvasItemContent(itemId: string, content: string) {
    updateItem(itemId, (item) => ({
      ...item,
      title: deriveCanvasTitle(content),
      content,
      summary: deriveCanvasSummary(content, item.summary),
    }))
  }

  async function insertCanvasItemImage(
    itemId: string,
    selectionStart: number,
    selectionEnd: number,
  ) {
    const imagePath = await pickImage()
    if (!imagePath) {
      return null
    }

    const fullUrl = resolveImageUrl(imagePath, workspacePath) ?? imagePath
    const snippet = `\n![Bild](${fullUrl})\n`
    const item = data?.items.find((entry) => entry.id === itemId)
    if (!item) {
      return null
    }

    recordCanvasHistorySnapshot()
    const nextContent = [
      item.content.slice(0, selectionStart),
      snippet,
      item.content.slice(selectionEnd),
    ].join('')

    updateCanvasItemContent(itemId, nextContent)
    return selectionStart + snippet.length
  }

  function markCanvasItemFocusHandled(itemId: string) {
    setPendingCanvasFocusItemId((current) =>
      current === itemId ? null : current,
    )
  }

  function resizeCanvasNode(itemId: string, width: number, height: number) {
    if (!activeCanvas) {
      return
    }

    updateCanvasQuiet(activeCanvas.id, (canvas) => ({
      ...canvas,
      nodes: canvas.nodes.map((node) =>
        node.itemId === itemId
          ? { ...node, width: Math.round(width), height: Math.round(height) }
          : node,
      ),
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
      edges: changed.map(toCanvasEdge),
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
      edges: nextEdges.map(toCanvasEdge),
    }))
  }

  function onCanvasReconnect(oldEdge: Edge, newConnection: Connection) {
    if (!activeCanvas) {
      return
    }

    const nextEdges = reconnectEdge(
      oldEdge,
      newConnection,
      toFlowEdges(activeCanvas.edges),
    )
    updateCanvas(activeCanvas.id, (canvas) => ({
      ...canvas,
      edges: nextEdges.map(toCanvasEdge),
    }))
  }

  function deleteSidebarTarget(target: SidebarMenuState) {
    setSidebarMenu(null)

    switch (target.kind) {
      case 'project':
        deleteProject(target.id)
        break
      case 'canvas':
        deleteCanvas(target.id)
        break
      case 'board':
        deleteBoard(target.id)
        break
      case 'script':
        deleteItem(target.id)
        break
    }
  }

  if (!data) {
    return <main className="loading">Tisch wird geladen...</main>
  }

  const projectItemsForSearch = activeProject
    ? data.items.filter((item) => item.projectId === activeProject.id)
    : []

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
              <img className="brand-icon" src={brandMarkUrl} alt="" />
            </span>
            <strong>Tisch</strong>
          </div>

          <section className="sidebar-section">
            <div className="sidebar-heading">Projekte</div>
            <nav className="project-list" aria-label="Projekte">
              {data.projects.map((project) => {
                const isActive = project.id === activeProjectId
                return (
                  <SidebarEditableRow
                    active={isActive}
                    className="project-row"
                    key={project.id}
                    label={project.name}
                    labelClassName="project-name"
                    leading={<span className="project-dot" aria-hidden />}
                    onClick={() => switchProject(project.id)}
                    onContextMenu={(event) =>
                      openSidebarMenu(event, {
                        kind: 'project',
                        id: project.id,
                      })
                    }
                    onRename={(value) => renameProject(project.id, value)}
                    trailing={
                      isActive ? (
                        <RefreshCw
                          className="project-sync"
                          size={12}
                          aria-hidden
                        />
                      ) : null
                    }
                    style={
                      {
                        '--project-accent': project.accent,
                      } as React.CSSProperties
                    }
                  />
                )
              })}
              <button className="project-row add-row" onClick={addProject}>
                <Plus size={14} aria-hidden />
                <span>Neues Projekt</span>
              </button>
            </nav>
          </section>

          {activeProject && (
            <section className="sidebar-section project-detail">
              <div className="project-detail-header">
                <button
                  className="project-detail-toggle"
                  onClick={() => setProjectDetailOpen((open) => !open)}
                  title={projectDetailOpen ? 'Bereich einklappen' : 'Bereich ausklappen'}
                >
                  {projectDetailOpen ? (
                    <ChevronDown size={14} aria-hidden />
                  ) : (
                    <ChevronRight size={14} aria-hidden />
                  )}
                </button>
                <span className="sidebar-title-label">{activeProject.name}</span>
              </div>

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
                      onRename: (value: string) => renameCanvas(canvas.id, value),
                      onContextMenu: (event: React.MouseEvent) =>
                        openSidebarMenu(event, {
                          kind: 'canvas',
                          id: canvas.id,
                        }),
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
                      onRename: (value: string) => renameBoard(board.id, value),
                      onContextMenu: (event: React.MouseEvent) =>
                        openSidebarMenu(event, {
                          kind: 'board',
                          id: board.id,
                        }),
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
                      onRename: (value: string) => renameItem(item.id, value),
                      onContextMenu: (event: React.MouseEvent) =>
                        openSidebarMenu(event, {
                          kind: 'script',
                          id: item.id,
                        }),
                    }))}
                  />
                </div>
              )}
            </section>
          )}
        </div>
      </aside>

      <section className="workspace">
        {!activeProject && (
          <EmptyView
            title="Kein Projekt"
            description="Lege zuerst ein Projekt an, damit du Canvas, Boards und Skripte organisieren kannst."
            actionLabel="Neues Projekt"
            onAction={addProject}
          />
        )}

        {activeProject && view === 'page' && activeItem && (
          <PageView
            item={activeItem}
            pageMode={pageMode}
            onModeChange={setPageMode}
            onUpdate={(item) => updateItem(item.id, () => item)}
            onToggleInspector={() => setRightOpen(!rightOpen)}
          />
        )}

        {activeProject && view === 'page' && !activeItem && (
          <EmptyView
            title="Keine Seite ausgewählt"
            description="Öffne ein Skript aus der Seitenleiste."
          />
        )}

        {activeProject && view === 'canvas' && activeCanvas && (
          <ReactFlowProvider>
            <CanvasView
              canvas={activeCanvas}
              items={data.items}
              edges={toFlowEdges(activeCanvas.edges)}
              onNodeDragStop={onCanvasNodeDragStop}
              onEdgesChange={onCanvasEdgesChange}
              onConnect={onCanvasConnect}
              onReconnect={onCanvasReconnect}
              onOpenNode={openNodeAsScript}
              onSelectNode={setActiveItemId}
              onAddExistingItem={addCanvasNodeForItem}
              onCreateNodeScript={addCanvasNodeAsNewScript}
              onCreateNodeAtPosition={(position) =>
                createCanvasScript({ position, focusBody: true })
              }
              onUpdateNodeContent={updateCanvasItemContent}
              onInsertNodeImage={insertCanvasItemImage}
              onResizeNode={resizeCanvasNode}
              onDeleteNode={deleteCanvasItem}
              canUndo={canvasUndoStack.length > 0}
              canRedo={canvasRedoStack.length > 0}
              onUndo={undoCanvas}
              onRedo={redoCanvas}
              pendingFocusItemId={pendingCanvasFocusItemId}
              onCanvasItemFocusHandled={markCanvasItemFocusHandled}
              projectItems={projectItemsForSearch}
              inspectorOpen={rightOpen}
              onToggleInspector={() => setRightOpen(!rightOpen)}
              edgeStyle={canvasEdgeStyle}
            />
          </ReactFlowProvider>
        )}

        {activeProject && view === 'canvas' && !activeCanvas && (
          <EmptyView
            title="Kein Canvas"
            description="Lege in der Seitenleiste ein neues Canvas an."
            actionLabel="Neues Canvas"
            onAction={addCanvas}
          />
        )}

        {activeProject && view === 'board' && activeBoard && (
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

        {activeProject && view === 'board' && !activeBoard && (
          <EmptyView
            title="Kein Board"
            description="Lege in der Seitenleiste ein neues Ideen Board an."
            actionLabel="Neues Board"
            onAction={addBoard}
          />
        )}
      </section>

      {rightOpen && activeProject && (
        <aside className="right-pane">
          {view === 'canvas' && (
            <CanvasSettings
              edgeStyle={canvasEdgeStyle}
              onEdgeStyleChange={setCanvasEdgeStyle}
            />
          )}
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

      {sidebarMenu && (
        <SidebarContextMenu
          x={sidebarMenu.x}
          y={sidebarMenu.y}
          onDelete={() => deleteSidebarTarget(sidebarMenu)}
        />
      )}
    </main>
  )
}

function SidebarEditableRow({
  active,
  className,
  label,
  labelClassName,
  leading,
  trailing,
  onClick,
  onRename,
  onContextMenu,
  style,
}: {
  active: boolean
  className: string
  label: string
  labelClassName?: string
  leading?: React.ReactNode
  trailing?: React.ReactNode
  onClick: () => void
  onRename: (value: string) => void
  onContextMenu: (event: React.MouseEvent) => void
  style?: React.CSSProperties
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(label)

  function commitDraft() {
    const nextValue = draft.trim() || label
    if (nextValue !== label) {
      onRename(nextValue)
    }
    setDraft(nextValue)
    setEditing(false)
  }

  function cancelDraft() {
    setDraft(label)
    setEditing(false)
  }

  const classes = active ? `${className} active` : className

  if (editing) {
    return (
      <div className={`${classes} is-editing`} onContextMenu={onContextMenu} style={style}>
        {leading}
        <input
          autoFocus
          className="sidebar-inline-input"
          value={draft}
          onBlur={commitDraft}
          onChange={(event) => setDraft(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur()
            }
            if (event.key === 'Escape') {
              cancelDraft()
            }
          }}
        />
        {trailing}
      </div>
    )
  }

  return (
    <button
      className={classes}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDoubleClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setDraft(label)
        setEditing(true)
      }}
      style={style}
    >
      {leading}
      <span className={labelClassName}>{label}</span>
      {trailing}
    </button>
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
    onRename: (value: string) => void
    onContextMenu: (event: React.MouseEvent) => void
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
            <SidebarEditableRow
              active={entry.active}
              className="page-row"
              key={entry.id}
              label={entry.label}
              leading={<FileText size={13} aria-hidden />}
              onClick={entry.onClick}
              onContextMenu={entry.onContextMenu}
              onRename={entry.onRename}
            />
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
  onModeChange,
  onUpdate,
  onToggleInspector,
}: {
  item: Item
  pageMode: PageMode
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
        <h1 className="page-title">{item.title}</h1>
        <div className="page-actions">
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

function deriveCanvasTitle(content: string) {
  const firstLine = content.split('\n').find((line) => line.trim())
  return firstLine?.trim().slice(0, 120) || 'Ohne Titel'
}

function deriveCanvasSummary(content: string, fallback: string) {
  const [, ...restLines] = content.split('\n')
  return deriveSummary(restLines.join('\n'), fallback)
}

function resolveImageUrl(
  imagePath: string | undefined,
  workspacePath: string,
): string | null {
  if (!imagePath) {
    return null
  }

  if (/^(data:|blob:|https?:|file:)/.test(imagePath)) {
    return imagePath
  }

  const normalizedPath = imagePath.startsWith('/')
    ? imagePath
    : `${workspacePath}/${imagePath}`

  return encodeURI(`file://${normalizedPath}`)
}

/* ------------------------------------------------------------------ */
/* Canvas view                                                         */
/* ------------------------------------------------------------------ */

function CanvasView({
  canvas,
  items,
  edges,
  onNodeDragStop,
  onEdgesChange,
  onConnect,
  onReconnect,
  onOpenNode,
  onSelectNode,
  onAddExistingItem,
  onCreateNodeScript,
  onCreateNodeAtPosition,
  onUpdateNodeContent,
  onInsertNodeImage,
  onResizeNode,
  onDeleteNode,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  pendingFocusItemId,
  onCanvasItemFocusHandled,
  projectItems,
  inspectorOpen,
  onToggleInspector,
  edgeStyle,
}: {
  canvas: IdeaCanvas
  items: Item[]
  edges: Edge[]
  onNodeDragStop: (node: Node) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  onReconnect: (oldEdge: Edge, newConnection: Connection) => void
  onOpenNode: (itemId: string) => void
  onSelectNode: (itemId: string | null) => void
  onAddExistingItem: (itemId: string) => void
  onCreateNodeScript: (title: string) => void
  onCreateNodeAtPosition: (position: { x: number; y: number }) => void
  onUpdateNodeContent: (itemId: string, content: string) => void
  onInsertNodeImage: (
    itemId: string,
    selectionStart: number,
    selectionEnd: number,
  ) => Promise<number | null>
  onResizeNode: (itemId: string, width: number, height: number) => void
  onDeleteNode: (itemId: string) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  pendingFocusItemId: string | null
  onCanvasItemFocusHandled: (itemId: string) => void
  projectItems: Item[]
  inspectorOpen: boolean
  onToggleInspector: () => void
  edgeStyle: CanvasEdgeStyle
}) {
  const { screenToFlowPosition } = useReactFlow()
  const [showGrid, setShowGrid] = useState(true)
  const [addOpen, setAddOpen] = useState(false)

  const sourceNodes = useMemo(
    () =>
      toFlowNodes(canvas.nodes, items, {
        onUpdateContent: onUpdateNodeContent,
        onOpenScript: onOpenNode,
        onInsertImage: onInsertNodeImage,
        pendingFocusItemId,
        onAutoFocusHandled: onCanvasItemFocusHandled,
        onResize: onResizeNode,
        onDelete: onDeleteNode,
      }),
    [
      canvas.nodes,
      items,
      onCanvasItemFocusHandled,
      onDeleteNode,
      onInsertNodeImage,
      onOpenNode,
      onResizeNode,
      onUpdateNodeContent,
      pendingFocusItemId,
    ],
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
            node.height,
            item?.title,
            item?.content,
            item?.summary,
            item?.imagePath,
          ].join(':')
        })
        .join('|'),
    [canvas.nodes, items],
  )
  const nodeTypes = useMemo<NodeTypes>(() => ({ tischNode: CanvasNoteNode }), [])
  const edgeTypeName =
    edgeStyle === 'smoothstep'
      ? 'smoothstep'
      : edgeStyle === 'straight'
        ? 'straight'
        : 'default'
  const connectionLineType =
    edgeStyle === 'smoothstep'
      ? ConnectionLineType.SmoothStep
      : edgeStyle === 'straight'
        ? ConnectionLineType.Straight
        : ConnectionLineType.Bezier
  const defaultEdgeOptions = useMemo(
    () => ({
      type: edgeTypeName,
      style: { strokeWidth: 1.6 },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      reconnectable: true,
    }),
    [edgeTypeName],
  )
  const [flowState, setFlowState] = useState<{
    sourceKey: string
    nodes: Node[]
  }>(() => ({ sourceKey, nodes: sourceNodes }))
  const flowNodes =
    flowState.sourceKey === sourceKey ? flowState.nodes : sourceNodes

  const takenItemIds = new Set(canvas.nodes.map((node) => node.itemId))
  const availableItems = projectItems.filter((item) => !takenItemIds.has(item.id))

  return (
    <section
      className="canvas-view"
      onDoubleClickCapture={(event) => {
        const target = event.target as HTMLElement
        if (!target.closest('.react-flow__pane')) {
          return
        }

        onCreateNodeAtPosition(
          screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          }),
        )
      }}
    >
      <ReactFlow
        key={canvas.id}
        nodes={flowNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
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
        onReconnect={onReconnect}
        reconnectRadius={28}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionLineType={connectionLineType}
        connectionLineStyle={{ strokeWidth: 1.6 }}
        deleteKeyCode={['Backspace', 'Delete']}
        onEdgesChange={onEdgesChange}
        onPaneClick={() => onSelectNode(null)}
        onNodeClick={(_, node) => onSelectNode(String(node.data.itemId))}
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
        panOnDrag
        nodesDraggable
        proOptions={{ hideAttribution: true }}
      >
        {showGrid && <Background color="#d7d9df" gap={24} />}
      </ReactFlow>

      <CanvasQuickActions onOpenAdd={() => setAddOpen(true)} />
      <CanvasZoomControls />
      <CanvasHistoryControls
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={onUndo}
        onRedo={onRedo}
      />
      <CanvasAuxControls
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid((value) => !value)}
        inspectorOpen={inspectorOpen}
        onToggleInspector={onToggleInspector}
      />

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

function CanvasQuickActions({
  onOpenAdd,
}: {
  onOpenAdd: () => void
}) {
  return (
    <div className="canvas-tool-pill" role="toolbar" aria-label="Canvas-Aktionen">
      <button
        className="canvas-action-button"
        onClick={onOpenAdd}
        title="Objekt hinzufügen"
      >
        <Plus size={16} />
      </button>
    </div>
  )
}

function CanvasZoomControls() {
  const { zoomIn, zoomOut, getViewport, setViewport } = useReactFlow()
  const [zoom, setZoom] = useState(100)

  useEffect(() => {
    const id = window.setInterval(() => {
      const vp = getViewport()
      setZoom(Math.round(vp.zoom * 100))
    }, 200)
    return () => window.clearInterval(id)
  }, [getViewport])

  function resetView() {
    const vp: Viewport = getViewport()
    setViewport({ ...vp, zoom: 1 })
  }

  return (
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
  )
}

function CanvasAuxControls({
  showGrid,
  onToggleGrid,
  inspectorOpen,
  onToggleInspector,
}: {
  showGrid: boolean
  onToggleGrid: () => void
  inspectorOpen: boolean
  onToggleInspector: () => void
}) {
  return (
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
  )
}

function CanvasHistoryControls({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}) {
  return (
    <div className="canvas-history" role="group" aria-label="Verlauf">
      <button
        className="history-button"
        disabled={!canUndo}
        onClick={onUndo}
        title="Schritt zurück"
      >
        <ChevronLeft size={14} />
      </button>
      <button
        className="history-button"
        disabled={!canRedo}
        onClick={onRedo}
        title="Schritt vor"
      >
        <ChevronRight size={14} />
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

function SidebarContextMenu({
  x,
  y,
  onDelete,
}: {
  x: number
  y: number
  onDelete: () => void
}) {
  return (
    <div className="sidebar-context-menu" style={{ left: x, top: y }}>
      <button className="sidebar-context-item danger" onClick={onDelete}>
        <Trash2 size={14} />
        Löschen
      </button>
    </div>
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
              {item.kind === 'script' ? 'Skript' : 'Canvas'}
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
/* Canvas settings                                                     */
/* ------------------------------------------------------------------ */

function CanvasSettings({
  edgeStyle,
  onEdgeStyleChange,
}: {
  edgeStyle: CanvasEdgeStyle
  onEdgeStyleChange: (next: CanvasEdgeStyle) => void
}) {
  const options: { value: CanvasEdgeStyle; label: string }[] = [
    { value: 'bezier', label: 'Kurve' },
    { value: 'smoothstep', label: 'Stufe' },
    { value: 'straight', label: 'Gerade' },
  ]

  return (
    <section className="inspector-card">
      <span className="eyebrow">Canvas</span>
      <h2>Einstellungen</h2>
      <div className="settings-row">
        <label className="settings-label">Verbindungen</label>
        <div className="segmented" role="radiogroup" aria-label="Verbindungsstil">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={edgeStyle === option.value}
              className={
                edgeStyle === option.value
                  ? 'segmented-option is-active'
                  : 'segmented-option'
              }
              onClick={() => onEdgeStyleChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </section>
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
      <span className="eyebrow">{view === 'page' ? 'Skript' : 'Objekt'}</span>
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
              item.kind === 'script' ? 'Skript' : null,
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

function toFlowNodes(
  nodes: CanvasNode[],
  items: Item[],
  callbacks: {
    onUpdateContent: (itemId: string, content: string) => void
    onOpenScript: (itemId: string) => void
    onInsertImage: (
      itemId: string,
      selectionStart: number,
      selectionEnd: number,
    ) => Promise<number | null>
    pendingFocusItemId: string | null
    onAutoFocusHandled: (itemId: string) => void
    onResize: (itemId: string, width: number, height: number) => void
    onDelete: (itemId: string) => void
  },
): Node[] {
  return nodes.map((node) => {
    const item = items.find((candidate) => candidate.id === node.itemId)

    return {
      id: node.id,
      position: { x: node.x, y: node.y },
      data: {
        itemId: node.itemId,
        content: item?.content ?? '',
        autoFocusBody: callbacks.pendingFocusItemId === node.itemId,
        onUpdateContent: callbacks.onUpdateContent,
        onOpenScript: callbacks.onOpenScript,
        onInsertImage: callbacks.onInsertImage,
        onAutoFocusHandled: callbacks.onAutoFocusHandled,
        onResize: callbacks.onResize,
        onDelete: callbacks.onDelete,
      },
      style: { width: node.width ?? 300, height: node.height ?? 220 },
      type: 'tischNode',
    }
  })
}

function CanvasNoteNode({
  data,
  selected,
}: NodeProps<Node<CanvasFlowNodeData, 'tischNode'>>) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [menuSelection, setMenuSelection] = useState<{
    selectionStart: number
    selectionEnd: number
  } | null>(null)

  useEffect(() => {
    if (!menuSelection) {
      return
    }

    function closeMenu() {
      setMenuSelection(null)
    }

    window.addEventListener('pointerdown', closeMenu)
    return () => window.removeEventListener('pointerdown', closeMenu)
  }, [menuSelection])

  useEffect(() => {
    if (!data.autoFocusBody || !textareaRef.current) {
      return
    }

    textareaRef.current.focus()
    const length = textareaRef.current.value.length
    textareaRef.current.setSelectionRange(length, length)
    data.onAutoFocusHandled(data.itemId)
  }, [data])

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={280}
        minHeight={160}
        lineClassName="canvas-node-resize-line"
        handleClassName="canvas-node-resize-handle"
        onResizeEnd={(_event, params) => {
          data.onResize(data.itemId, params.width, params.height)
        }}
      />
      <Handle
        className="canvas-node-handle canvas-node-handle--target"
        id="left"
        position={Position.Left}
        type="target"
      />
      <Handle
        className="canvas-node-handle canvas-node-handle--target"
        id="top"
        position={Position.Top}
        type="target"
      />
      <div className={selected ? 'canvas-note-node is-selected' : 'canvas-note-node'}>
        <div className="canvas-note-header">
          <button
            className="canvas-node-open nodrag"
            onClick={(event) => {
              event.stopPropagation()
              data.onOpenScript(data.itemId)
            }}
            onPointerDown={(event) => event.stopPropagation()}
            title="Als Skript öffnen"
          >
            <ArrowUpRight size={14} />
          </button>
        </div>

        <textarea
          ref={textareaRef}
          className="canvas-note-body nodrag nowheel"
          placeholder="Schreib hier..."
          value={data.content}
          onChange={(event) =>
            data.onUpdateContent(data.itemId, event.target.value)
          }
          onContextMenu={(event) => {
            event.preventDefault()
            event.stopPropagation()
            const textarea = event.currentTarget
            setMenuSelection({
              selectionStart: textarea.selectionStart,
              selectionEnd: textarea.selectionEnd,
            })
          }}
          onPointerDown={(event) => event.stopPropagation()}
        />

        {menuSelection && (
          <div className="canvas-note-menu nodrag" onPointerDown={(event) => event.stopPropagation()}>
            <button
              className="canvas-note-menu-item"
              onMouseDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onClick={async (event) => {
                event.stopPropagation()
                const textarea = textareaRef.current
                if (!textarea || !menuSelection) {
                  setMenuSelection(null)
                  return
                }

                const cursor = await data.onInsertImage(
                  data.itemId,
                  menuSelection.selectionStart,
                  menuSelection.selectionEnd,
                )
                setMenuSelection(null)
                if (cursor !== null && textareaRef.current) {
                  textareaRef.current.focus()
                  textareaRef.current.setSelectionRange(cursor, cursor)
                }
              }}
            >
              <Plus size={12} />
              Bild hinzufügen
            </button>
            <button
              className="canvas-note-menu-item danger"
              onMouseDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onClick={(event) => {
                event.stopPropagation()
                setMenuSelection(null)
                data.onDelete(data.itemId)
              }}
            >
              <Trash2 size={12} />
              Löschen
            </button>
          </div>
        )}
      </div>
      <Handle
        className="canvas-node-handle canvas-node-handle--source"
        id="right"
        position={Position.Right}
        type="source"
      />
      <Handle
        className="canvas-node-handle canvas-node-handle--source"
        id="bottom"
        position={Position.Bottom}
        type="source"
      />
    </>
  )
}

function toFlowEdges(edges: CanvasEdge[]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
  }))
}

function toCanvasEdge(edge: Edge): CanvasEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
  }
}

export default App
