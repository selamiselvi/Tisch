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
  Minus,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react'
import {
  MarkdownEditor,
  type MarkdownMode,
} from './components/editor/MarkdownEditor'
import brandMarkUrl from './assets/tisch-mark.svg'
import boardSectionUrl from './assets/board-section.svg'
import canvasSectionUrl from './assets/canvas-section.svg'
import projectSectionUrl from './assets/project-section.svg'
import scriptSectionUrl from './assets/script-section.svg'
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
type SidebarIconComponent = React.ComponentType<{
  className?: string
  size?: number
  'aria-hidden'?: boolean
}>

type CanvasFlowNodeData = {
  itemId: string
  title: string
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

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n?/g, '\n')
}

function buildItemContentPath(projectId: string, title: string, itemId: string) {
  const slug =
    slugify(
      `${projectId || 'projekt'}-${title || 'ohne-titel'}-${itemId.slice(-4)}`,
    ) || `item-${itemId.slice(-4)}`
  return `pages/${slug}.md`
}

function splitItemContent(content: string) {
  const normalized = normalizeLineEndings(content)
  if (!normalized.trim()) {
    return { title: '', body: '' }
  }

  const lines = normalized.split('\n')
  const firstMeaningfulIndex = lines.findIndex((line) => line.trim())
  if (firstMeaningfulIndex === -1) {
    return { title: '', body: '' }
  }

  const firstMeaningfulLine = lines[firstMeaningfulIndex].trim()
  const title = firstMeaningfulLine.replace(/^#{1,6}\s+/, '').trim()

  let bodyLines = lines.slice(firstMeaningfulIndex + 1)
  if (/^#{1,6}\s+/.test(firstMeaningfulLine) && bodyLines[0]?.trim() === '') {
    bodyLines = bodyLines.slice(1)
  }

  return {
    title,
    body: bodyLines.join('\n'),
  }
}

function composeItemContent(title: string, body: string) {
  const nextTitle = title.trim()
  const nextBody = normalizeLineEndings(body).replace(/^\n+/, '')

  if (!nextTitle) {
    return nextBody
  }

  return nextBody ? `# ${nextTitle}\n\n${nextBody}` : `# ${nextTitle}`
}

function deriveItemFieldsFromContent(item: Item, content: string) {
  const { title, body } = splitItemContent(content)
  const nextTitle = title.slice(0, 120) || item.title || 'Ohne Titel'
  return {
    title: nextTitle,
    content,
    summary: deriveSummary(body, ''),
    contentPath: buildItemContentPath(item.projectId, nextTitle, item.id),
  }
}

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

function BoardSidebarIcon({
  className,
  size = 28,
}: {
  className?: string
  size?: number
  'aria-hidden'?: boolean
}) {
  return (
    <img
      alt=""
      aria-hidden
      className={className}
      height={size}
      src={boardSectionUrl}
      width={size}
    />
  )
}

function CanvasSidebarIcon({
  className,
  size = 28,
}: {
  className?: string
  size?: number
  'aria-hidden'?: boolean
}) {
  return (
    <img
      alt=""
      aria-hidden
      className={className}
      height={size}
      src={canvasSectionUrl}
      width={size}
    />
  )
}

function ScriptSidebarIcon({
  className,
  size = 28,
}: {
  className?: string
  size?: number
  'aria-hidden'?: boolean
}) {
  return (
    <img
      alt=""
      aria-hidden
      className={className}
      height={size}
      src={scriptSectionUrl}
      width={size}
    />
  )
}

function ProjectSidebarIcon({
  className,
  size = 28,
}: {
  className?: string
  size?: number
  'aria-hidden'?: boolean
}) {
  return (
    <img
      alt=""
      aria-hidden
      className={className}
      height={size}
      src={projectSectionUrl}
      width={size}
    />
  )
}

function moveBoardCard(
  board: Board,
  cardId: string,
  columnId: string,
  beforeCardId: string | null,
) {
  const card = board.cards.find((entry) => entry.id === cardId)
  if (!card || !board.columns.some((column) => column.id === columnId)) {
    return board
  }

  if (beforeCardId === cardId) {
    return board
  }

  const remainingCards = board.cards.filter((entry) => entry.id !== cardId)
  const targetCards = remainingCards.filter((entry) => entry.columnId === columnId)
  const normalizedBeforeCardId =
    beforeCardId && targetCards.some((entry) => entry.id === beforeCardId)
      ? beforeCardId
      : null

  const nextCard = { ...card, columnId }
  let insertIndex = remainingCards.length

  if (normalizedBeforeCardId) {
    insertIndex = remainingCards.findIndex(
      (entry) => entry.id === normalizedBeforeCardId,
    )
  } else {
    let lastTargetIndex = -1
    remainingCards.forEach((entry, index) => {
      if (entry.columnId === columnId) {
        lastTargetIndex = index
      }
    })
    insertIndex = lastTargetIndex === -1 ? remainingCards.length : lastTargetIndex + 1
  }

  const nextCards = [...remainingCards]
  nextCards.splice(insertIndex, 0, nextCard)

  const unchanged =
    board.cards.length === nextCards.length &&
    board.cards.every(
      (entry, index) =>
        entry.id === nextCards[index]?.id &&
        entry.itemId === nextCards[index]?.itemId &&
        entry.columnId === nextCards[index]?.columnId,
    )

  if (unchanged) {
    return board
  }

  return { ...board, cards: nextCards }
}

function updateItemStatus(
  items: Item[],
  itemId: string,
  status: string,
) {
  const now = new Date().toISOString()
  let changed = false
  const nextItems = items.map((item) => {
    if (item.id !== itemId || item.status === status) {
      return item
    }
    changed = true
    return { ...item, status, updatedAt: now }
  })

  return changed ? nextItems : items
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
  const [hideDone, setHideDone] = useState(false)
  const [sidebarMenu, setSidebarMenu] = useState<SidebarMenuState | null>(null)
  const [pendingCanvasFocusItemId, setPendingCanvasFocusItemId] = useState<
    string | null
  >(null)
  const [canvasUndoStack, setCanvasUndoStack] = useState<PlannerData[]>([])
  const [canvasRedoStack, setCanvasRedoStack] = useState<PlannerData[]>([])
  const dataRef = useRef<PlannerData | null>(null)
  const saveVersion = useRef(0)
  const saveTimer = useRef<number | null>(null)

  useEffect(() => {
    void Promise.all([loadPlanner(), getWorkspacePath()]).then(
      ([planner, path]) => {
        dataRef.current = planner
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

  useEffect(() => {
    if (!rightOpen) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setRightOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [rightOpen])

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
    nextOrUpdater: PlannerData | ((current: PlannerData) => PlannerData),
    options: { delayMs?: number } = {},
  ) {
    const current = dataRef.current
    const next =
      typeof nextOrUpdater === 'function'
        ? current
          ? nextOrUpdater(current)
          : null
        : nextOrUpdater

    if (!next) {
      return
    }

    dataRef.current = next
    setData(next)

    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
    }

    const version = ++saveVersion.current
    saveTimer.current = window.setTimeout(() => {
      void savePlanner(next).then((saved) => {
        if (saveVersion.current !== version) {
          return
        }
        dataRef.current = saved
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
    const version = ++saveVersion.current
    dataRef.current = snapshot
    setData(snapshot)
    void savePlanner(snapshot).then((saved) => {
      if (saveVersion.current !== version) {
        return
      }
      dataRef.current = saved
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
    if (!dataRef.current) {
      return
    }

    commit((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === itemId
          ? { ...updater(item), updatedAt: new Date().toISOString() }
          : item,
      ),
    }))
  }

  function updateBoard(boardId: string, updater: (board: Board) => Board) {
    if (!dataRef.current) {
      return
    }

    commit((current) => ({
      ...current,
      boards: current.boards.map((board) =>
        board.id === boardId ? updater(board) : board,
      ),
    }))
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
      contentPath: buildItemContentPath(activeProjectId ?? '', title, id),
      content: composeItemContent(title, ''),
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

    updateItem(itemId, (item) => {
      const { body } = splitItemContent(item.content)
      return {
        ...item,
        title: nextTitle,
        content: composeItemContent(nextTitle, body),
        contentPath: buildItemContentPath(item.projectId, nextTitle, item.id),
        summary: deriveSummary(body, ''),
      }
    })
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

  function moveCard(
    cardId: string,
    columnId: string,
    beforeCardId: string | null,
  ) {
    if (!activeBoard) {
      return
    }

    commit((current) => {
      const board = current.boards.find((entry) => entry.id === activeBoard.id)
      if (!board) {
        return current
      }

      const card = board.cards.find((entry) => entry.id === cardId)
      if (!card) {
        return current
      }

      const nextBoard = moveBoardCard(board, cardId, columnId, beforeCardId)
      if (nextBoard === board) {
        return current
      }

      return {
        ...current,
        boards: current.boards.map((entry) =>
          entry.id === board.id ? nextBoard : entry,
        ),
        items:
          card.columnId === columnId
            ? current.items
            : updateItemStatus(current.items, card.itemId, columnId),
      }
    })
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

    commit((current) => {
      const board = current.boards.find((entry) => entry.id === activeBoard.id)
      if (!board || board.columns.length < 2) {
        return current
      }

      const fallbackColumn = board.columns.find((column) => column.id !== columnId)
      if (!fallbackColumn) {
        return current
      }

      const movedItemIds = board.cards
        .filter((card) => card.columnId === columnId)
        .map((card) => card.itemId)

      let nextItems = current.items
      movedItemIds.forEach((itemId) => {
        nextItems = updateItemStatus(nextItems, itemId, fallbackColumn.id)
      })

      return {
        ...current,
        boards: current.boards.map((entry) =>
          entry.id === board.id
            ? {
                ...entry,
                columns: entry.columns.filter((column) => column.id !== columnId),
                cards: entry.cards.map((card) =>
                  card.columnId === columnId
                    ? { ...card, columnId: fallbackColumn.id }
                    : card,
                ),
              }
            : entry,
        ),
        items: nextItems,
      }
    })
  }

  /** Add a board card that references an existing item. */
  function addBoardCardForItem(columnId: string, itemId: string) {
    if (!activeBoard) {
      return
    }

    commit((current) => {
      const board = current.boards.find((entry) => entry.id === activeBoard.id)
      if (!board || board.cards.some((card) => card.itemId === itemId)) {
        return current
      }

      return {
        ...current,
        boards: current.boards.map((entry) =>
          entry.id === board.id
            ? {
                ...entry,
                cards: [
                  ...entry.cards,
                  { id: `card-${nanoid(8)}`, itemId, columnId },
                ],
              }
            : entry,
        ),
        items: updateItemStatus(current.items, itemId, columnId),
      }
    })
  }

  /** Create a brand new script item and add it as a board card. */
  function addBoardCardAsNewScript(columnId: string, title: string) {
    if (!activeBoard) {
      return
    }

    commit((current) => {
      const board = current.boards.find((entry) => entry.id === activeBoard.id)
      if (!board) {
        return current
      }

      const item = { ...buildItem(title), status: columnId }
      return {
        ...current,
        items: [item, ...current.items],
        boards: current.boards.map((entry) =>
          entry.id === board.id
            ? {
                ...entry,
                cards: [
                  ...entry.cards,
                  { id: `card-${nanoid(8)}`, itemId: item.id, columnId },
                ],
              }
            : entry,
        ),
      }
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
      content: options.title ? composeItemContent(options.title, '') : '',
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
      ...deriveItemFieldsFromContent(item, content),
    }))
  }

  function updateBoardItemContent(itemId: string, content: string) {
    updateItem(itemId, (item) => ({
      ...item,
      ...deriveItemFieldsFromContent(item, content),
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
        <div className="sidebar-brand-shell">
          <div className="sidebar-brand">
            <span className="brand-mark" aria-hidden>
              <img className="brand-icon" src={brandMarkUrl} alt="" />
            </span>
            <strong>Tisch</strong>
          </div>
        </div>

        <div className="sidebar-body">
          <section className="sidebar-section sidebar-projects">
            <div className="sidebar-heading sidebar-heading-with-icon">
              <ProjectSidebarIcon
                className="sidebar-heading-icon"
                size={28}
                aria-hidden
              />
              <span>Projekte</span>
            </div>
            <div className="sidebar-section-scroll">
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
                    />
                  )
                })}
                <button className="project-row add-row" onClick={addProject}>
                  <Plus size={14} aria-hidden />
                  <span>Neues Projekt</span>
                </button>
              </nav>
            </div>
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
                <div className="sidebar-section-scroll project-detail-scroll">
                  <div className="category-list">
                    <CategorySection
                      id="canvas"
                      label="Canvas"
                      icon={CanvasSidebarIcon}
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
                      icon={BoardSidebarIcon}
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
                      icon={ScriptSidebarIcon}
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
            onToggleInspector={() => setRightOpen((open) => !open)}
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
              onToggleInspector={() => setRightOpen((open) => !open)}
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
            onSelectItem={setActiveItemId}
            inspectorOpen={rightOpen}
            onToggleInspector={() => setRightOpen((open) => !open)}
            onCloseInspector={() => setRightOpen(false)}
            onOpenItem={openNodeAsScript}
            onOpenInspectorItem={(itemId) => {
              setActiveItemId(itemId)
              setRightOpen(true)
            }}
            onUpdateItemContent={updateBoardItemContent}
            onMoveCard={moveCard}
            onAddColumn={addColumn}
            onRenameColumn={renameColumn}
            onDeleteColumn={deleteColumn}
            onAddExistingToColumn={addBoardCardForItem}
            onCreateCardInColumn={addBoardCardAsNewScript}
            onToggleDone={(itemId) =>
              updateItem(itemId, (item) => ({ ...item, done: !item.done }))
            }
            onToggleHideDone={() => setHideDone((hidden) => !hidden)}
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
          <div className="right-pane-header">
            <span className="right-pane-title">Inspector</span>
            <button
              className="right-pane-close"
              onClick={() => setRightOpen(false)}
              title="Inspector schließen"
            >
              <X size={16} />
            </button>
          </div>
          <div className="right-pane-content">
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
          </div>
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
  icon: SidebarIconComponent
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
        <Icon className="category-icon" size={28} aria-hidden />
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
      ...deriveItemFieldsFromContent(item, content),
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
        if (target.closest('.react-flow__node')) {
          return
        }
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
        onConnect={onConnect}
        onReconnect={onReconnect}
        reconnectRadius={28}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionLineType={connectionLineType}
        connectionLineStyle={{ strokeWidth: 1.6 }}
        deleteKeyCode={['Backspace', 'Delete']}
        onEdgesChange={onEdgesChange}
        onPaneClick={() => {
          onSelectNode(null)
          if (inspectorOpen) {
            onToggleInspector()
          }
        }}
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
        <Background color="#d7d9df" gap={24} />
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
  inspectorOpen,
  onToggleInspector,
}: {
  inspectorOpen: boolean
  onToggleInspector: () => void
}) {
  return (
    <div className="canvas-aux" role="group" aria-label="Ansicht">
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

const CARD_DND_MIME = 'application/x-tisch-card'

function BoardView({
  board,
  items,
  projectItems,
  hideDone,
  selectedItemId,
  onSelectItem,
  inspectorOpen,
  onToggleInspector,
  onCloseInspector,
  onOpenItem,
  onOpenInspectorItem,
  onUpdateItemContent,
  onMoveCard,
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
  onSelectItem: (id: string | null) => void
  inspectorOpen: boolean
  onToggleInspector: () => void
  onCloseInspector: () => void
  onOpenItem: (id: string) => void
  onOpenInspectorItem: (id: string) => void
  onUpdateItemContent: (itemId: string, content: string) => void
  onMoveCard: (
    cardId: string,
    columnId: string,
    beforeCardId: string | null,
  ) => void
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
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{
    columnId: string
    beforeCardId: string | null
  } | null>(null)
  const draggingCardIdRef = useRef<string | null>(null)

  function startDrag(cardId: string) {
    draggingCardIdRef.current = cardId
    setDraggingCardId(cardId)
  }

  function endDrag() {
    draggingCardIdRef.current = null
    setDraggingCardId(null)
    setDropTarget(null)
  }

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
      <CanvasAuxControls
        inspectorOpen={inspectorOpen}
        onToggleInspector={onToggleInspector}
      />
      <div
        className="board-grid"
        onClick={(event) => {
          const target = event.target as HTMLElement
          if (
            target.closest(
              '.work-card, .column-add-button, .item-picker, .kanban-column header',
            )
          ) {
            return
          }
          onSelectItem(null)
          onCloseInspector()
        }}
      >
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
              onCloseInspector={onCloseInspector}
              onOpenItem={onOpenItem}
              onOpenInspectorItem={onOpenInspectorItem}
              onUpdateItemContent={onUpdateItemContent}
              draggingCardId={draggingCardId}
              getDraggedCardId={() => draggingCardIdRef.current}
              dropTarget={
                dropTarget && dropTarget.columnId === column.id
                  ? dropTarget
                  : null
              }
              onCardDragStart={startDrag}
              onCardDragEnd={endDrag}
              onSetDropTarget={(beforeCardId) =>
                setDropTarget({ columnId: column.id, beforeCardId })
              }
              onClearDropTarget={() => setDropTarget(null)}
              onCommitDrop={(cardId, beforeCardId) => {
                onMoveCard(cardId, column.id, beforeCardId)
                endDrag()
              }}
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
    <div
      className="sidebar-context-menu"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      style={{ left: x, top: y }}
    >
      <button
        className="sidebar-context-item danger"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onDelete}
      >
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
  onCloseInspector,
  onOpenItem,
  onOpenInspectorItem,
  onUpdateItemContent,
  draggingCardId,
  getDraggedCardId,
  dropTarget,
  onCardDragStart,
  onCardDragEnd,
  onSetDropTarget,
  onClearDropTarget,
  onCommitDrop,
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
  onSelectItem: (id: string | null) => void
  onCloseInspector: () => void
  onOpenItem: (id: string) => void
  onOpenInspectorItem: (id: string) => void
  onUpdateItemContent: (itemId: string, content: string) => void
  draggingCardId: string | null
  getDraggedCardId: () => string | null
  dropTarget: { beforeCardId: string | null } | null
  onCardDragStart: (cardId: string) => void
  onCardDragEnd: () => void
  onSetDropTarget: (beforeCardId: string | null) => void
  onClearDropTarget: () => void
  onCommitDrop: (cardId: string, beforeCardId: string | null) => void
  onRename: (title: string) => void
  onDelete: () => void
  onAddExisting: (itemId: string) => void
  onCreateNew: (title: string) => void
  onToggleDone: (itemId: string) => void
}) {
  const [adderOpen, setAdderOpen] = useState(false)
  const isDropTarget = dropTarget !== null
  const resolveDraggedCardId = (event: { dataTransfer: DataTransfer }) => {
    const draggedCardId = getDraggedCardId()
    if (draggedCardId) {
      return draggedCardId
    }

    return (
      event.dataTransfer.getData(CARD_DND_MIME) ||
      event.dataTransfer.getData('text/plain') ||
      null
    )
  }

  return (
    <section
      className={'kanban-column' + (isDropTarget ? ' is-drop-target' : '')}
      onDragOver={(event) => {
        if (!resolveDraggedCardId(event)) {
          return
        }
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        if (!dropTarget) {
          onSetDropTarget(null)
        }
      }}
      onDragLeave={(event) => {
        const related = event.relatedTarget as globalThis.Node | null
        if (related && event.currentTarget.contains(related)) {
          return
        }
        onClearDropTarget()
      }}
      onDrop={(event) => {
        const cardId = resolveDraggedCardId(event)
        if (!cardId) {
          return
        }
        event.preventDefault()
        const beforeCardId = dropTarget?.beforeCardId ?? null
        onCommitDrop(cardId, beforeCardId)
      }}
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
        {cards.map(({ card, item }, index) => {
          if (!item) {
            return null
          }
          const showIndicatorAbove =
            isDropTarget && dropTarget?.beforeCardId === card.id
          const isDraggingThis = draggingCardId === card.id
          return (
            <div className="card-slot" key={card.id}>
              {showIndicatorAbove && <div className="drop-indicator" />}
              <article
                className={
                  'work-card' +
                  (item.id === selectedItemId ? ' selected' : '') +
                  (isDraggingThis ? ' is-dragging' : '')
                }
                draggable
                onClick={() => {
                  const shouldClearSelection = item.id === selectedItemId
                  onSelectItem(shouldClearSelection ? null : item.id)
                  if (shouldClearSelection) {
                    onCloseInspector()
                  }
                }}
                onDoubleClickCapture={(event) => {
                  const target = event.target as HTMLElement
                  if (target.closest('.work-card-open, .done-check')) {
                    return
                  }
                  onSelectItem(item.id)
                  onOpenInspectorItem(item.id)
                }}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData(CARD_DND_MIME, card.id)
                  event.dataTransfer.setData('text/plain', card.id)
                  onCardDragStart(card.id)
                }}
                onDragEnd={onCardDragEnd}
                onDragOver={(event) => {
                  if (!resolveDraggedCardId(event)) {
                    return
                  }
                  event.preventDefault()
                  event.stopPropagation()
                  event.dataTransfer.dropEffect = 'move'
                  const rect = event.currentTarget.getBoundingClientRect()
                  const isUpperHalf =
                    event.clientY < rect.top + rect.height / 2
                  if (isUpperHalf) {
                    onSetDropTarget(card.id)
                  } else {
                    const nextCard = cards[index + 1]
                    onSetDropTarget(nextCard ? nextCard.card.id : null)
                  }
                }}
              >
                <BoardCardEditor
                  item={item}
                  onFocus={() => onSelectItem(item.id)}
                  onOpen={() => onOpenItem(item.id)}
                  onUpdateContent={onUpdateItemContent}
                  onToggleDone={onToggleDone}
                />
                {item.tags.length > 0 && (
                  <div className="tag-row">
                    {item.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                )}
              </article>
            </div>
          )
        })}

        {isDropTarget && dropTarget?.beforeCardId === null && (
          <div className="drop-indicator" />
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

function BoardCardEditor({
  item,
  onFocus,
  onOpen,
  onUpdateContent,
  onToggleDone,
}: {
  item: Item
  onFocus: () => void
  onOpen: () => void
  onUpdateContent: (itemId: string, content: string) => void
  onToggleDone: (itemId: string) => void
}) {
  const { title, body } = useMemo(
    () => splitItemContent(item.content),
    [item.content],
  )

  function updateTitle(nextTitle: string) {
    onUpdateContent(item.id, composeItemContent(nextTitle, body))
  }

  function updateBody(nextBody: string) {
    onUpdateContent(item.id, composeItemContent(title, nextBody))
  }

  return (
    <>
      <div className="card-title-row">
        <input
          className="work-card-title"
          placeholder="Titel"
          value={title}
          onChange={(event) => updateTitle(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onFocus={onFocus}
          onPointerDown={(event) => event.stopPropagation()}
        />
        <div className="work-card-actions">
          <button
            className="work-card-open"
            onClick={(event) => {
              event.stopPropagation()
              onOpen()
            }}
            onPointerDown={(event) => event.stopPropagation()}
            title="Als Skript öffnen"
          >
            <ArrowUpRight size={14} />
          </button>
          <button
            className={item.done ? 'done-check checked' : 'done-check'}
            onClick={(event) => {
              event.stopPropagation()
              onToggleDone(item.id)
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <span aria-hidden>✓</span>
          </button>
        </div>
      </div>
      <textarea
        className="work-card-body"
        placeholder="Hier direkt weiterdenken…"
        value={body}
        onChange={(event) => updateBody(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onFocus={onFocus}
        onPointerDown={(event) => event.stopPropagation()}
      />
    </>
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
    <>
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
      {view === 'board' && canvas && (
        <CanvasConnectionMap item={item} canvas={canvas} items={items} />
      )}
    </>
  )
}

function CanvasConnectionMap({
  item,
  canvas,
  items,
}: {
  item: Item
  canvas: IdeaCanvas
  items: Item[]
}) {
  const node = canvas.nodes.find((entry) => entry.itemId === item.id)
  const connectedNodeIds = new Set(
    node
      ? canvas.edges.flatMap((edge) => {
          if (edge.source === node.id) {
            return [edge.target]
          }
          if (edge.target === node.id) {
            return [edge.source]
          }
          return []
        })
      : [],
  )
  const connectedItems = Array.from(connectedNodeIds)
    .map((nodeId) => canvas.nodes.find((entry) => entry.id === nodeId))
    .filter(Boolean)
    .map((entry) => items.find((candidate) => candidate.id === entry?.itemId))
    .filter(Boolean) as Item[]

  const nodesWithLayout = canvas.nodes.map((entry) => ({
    ...entry,
    width: entry.width ?? 300,
    height: entry.height ?? 220,
  }))
  const bounds = nodesWithLayout.reduce(
    (result, entry) => ({
      minX: Math.min(result.minX, entry.x),
      minY: Math.min(result.minY, entry.y),
      maxX: Math.max(result.maxX, entry.x + entry.width),
      maxY: Math.max(result.maxY, entry.y + entry.height),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  )
  const hasBounds = Number.isFinite(bounds.minX)
  const viewWidth = 332
  const viewHeight = 232
  const padding = 22
  const contentWidth = hasBounds ? Math.max(1, bounds.maxX - bounds.minX) : 1
  const contentHeight = hasBounds ? Math.max(1, bounds.maxY - bounds.minY) : 1
  const scale = Math.min(
    (viewWidth - padding * 2) / contentWidth,
    (viewHeight - padding * 2) / contentHeight,
  )
  const offsetX = hasBounds
    ? (viewWidth - contentWidth * scale) / 2 - bounds.minX * scale
    : padding
  const offsetY = hasBounds
    ? (viewHeight - contentHeight * scale) / 2 - bounds.minY * scale
    : padding

  return (
    <section className="connection-map-section">
      <div className="connection-map-header">
        <span className="eyebrow">Canvas</span>
        <span className="connection-map-name">{canvas.title}</span>
      </div>
      {!node ? (
        <p className="connection-map-empty">
          Dieses Objekt liegt im aktuellen Canvas nicht als Node vor.
        </p>
      ) : (
        <>
          <div className="connection-map-frame">
            <svg
              className="connection-map-svg"
              viewBox={`0 0 ${viewWidth} ${viewHeight}`}
              aria-label="Verbindungen im Canvas"
            >
              <defs>
                <pattern
                  id="connection-map-grid"
                  width="24"
                  height="24"
                  patternUnits="userSpaceOnUse"
                >
                  <line
                    className="connection-map-grid-line"
                    x1="24"
                    y1="0"
                    x2="24"
                    y2="24"
                  />
                  <line
                    className="connection-map-grid-line"
                    x1="0"
                    y1="24"
                    x2="24"
                    y2="24"
                  />
                </pattern>
              </defs>

              <rect
                className="connection-map-surface"
                x="0"
                y="0"
                width={viewWidth}
                height={viewHeight}
                rx="22"
                ry="22"
              />
              <rect
                className="connection-map-grid"
                x="0"
                y="0"
                width={viewWidth}
                height={viewHeight}
                rx="22"
                ry="22"
              />

              {canvas.edges.map((edge) => {
                const source = nodesWithLayout.find((entry) => entry.id === edge.source)
                const target = nodesWithLayout.find((entry) => entry.id === edge.target)
                if (!source || !target) {
                  return null
                }

                const sourceHighlighted =
                  source.id === node.id || connectedNodeIds.has(source.id)
                const targetHighlighted =
                  target.id === node.id || connectedNodeIds.has(target.id)

                return (
                  <line
                    key={edge.id}
                    className={
                      sourceHighlighted && targetHighlighted
                        ? 'connection-map-line connection-map-line--active'
                        : 'connection-map-line'
                    }
                    x1={offsetX + (source.x + source.width / 2) * scale}
                    y1={offsetY + (source.y + source.height / 2) * scale}
                    x2={offsetX + (target.x + target.width / 2) * scale}
                    y2={offsetY + (target.y + target.height / 2) * scale}
                  />
                )
              })}

              {nodesWithLayout.map((entry) => {
                const mappedItem = items.find((candidate) => candidate.id === entry.itemId)
                const isActive = entry.id === node.id
                const isConnected = connectedNodeIds.has(entry.id)
                const width = Math.max(18, entry.width * scale)
                const height = Math.max(14, entry.height * scale)
                const x = offsetX + entry.x * scale
                const y = offsetY + entry.y * scale
                const { title, body } = splitItemContent(mappedItem?.content ?? '')
                const noteTitle = (title || mappedItem?.title || 'Ohne Titel').slice(0, 18)
                const bodyLines = (body || mappedItem?.summary || '')
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .slice(0, 3)
                const inset = Math.max(6, Math.min(10, width * 0.08))
                const titleY = y + Math.max(10, Math.min(16, height * 0.22))
                const bodyStartY = titleY + Math.max(8, Math.min(12, height * 0.16))
                const bodyLineSpacing = Math.max(5, Math.min(9, height * 0.12))
                const openButtonSize = Math.max(6, Math.min(10, width * 0.12))
                const canShowTitle = width >= 46 && height >= 28
                const canShowBody = width >= 58 && height >= 38

                return (
                  <g key={entry.id}>
                    <rect
                      className={[
                        'connection-map-note-shadow',
                        isActive ? 'connection-map-note-shadow--active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      x={x + 2}
                      y={y + 3}
                      rx={Math.min(18, height / 3)}
                      ry={Math.min(18, height / 3)}
                      width={width}
                      height={height}
                    />
                    <rect
                      className={[
                        'connection-map-note',
                        isConnected ? 'connection-map-note--linked' : '',
                        isActive ? 'connection-map-note--active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      x={x}
                      y={y}
                      rx={Math.min(14, height / 3)}
                      ry={Math.min(14, height / 3)}
                      width={width}
                      height={height}
                    />
                    {canShowTitle && (
                      <>
                        <text
                          className={
                            isActive
                              ? 'connection-map-note-title connection-map-note-title--active'
                              : 'connection-map-note-title'
                          }
                          x={x + inset}
                          y={titleY}
                        >
                          {noteTitle}
                        </text>
                        <rect
                          className={
                            isActive
                              ? 'connection-map-note-open connection-map-note-open--active'
                              : 'connection-map-note-open'
                          }
                          x={x + width - inset - openButtonSize}
                          y={y + inset}
                          rx={Math.max(2, openButtonSize / 3)}
                          ry={Math.max(2, openButtonSize / 3)}
                          width={openButtonSize}
                          height={openButtonSize}
                        />
                      </>
                    )}
                    {canShowBody &&
                      (bodyLines.length > 0 ? bodyLines : ['', '', '']).map(
                        (line, index) => {
                          const lineWidthFactor = line
                            ? Math.max(0.34, Math.min(0.92, line.length / 24))
                            : [0.74, 0.58, 0.41][index]
                          const lineWidth = (width - inset * 2) * lineWidthFactor
                          return (
                            <line
                              key={`${entry.id}-line-${index}`}
                              className={
                                isActive
                                  ? 'connection-map-note-line connection-map-note-line--active'
                                  : 'connection-map-note-line'
                              }
                              x1={x + inset}
                              y1={bodyStartY + index * bodyLineSpacing}
                              x2={x + inset + lineWidth}
                              y2={bodyStartY + index * bodyLineSpacing}
                            />
                          )
                        },
                      )}
                  </g>
                )
              })}
            </svg>
          </div>
          <div className="connection-map-caption">
            <span>{connectedItems.length} direkte Verbindungen</span>
            <span>{canvas.nodes.length} Nodes im Canvas</span>
          </div>
        </>
      )}
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
        title: item?.title ?? 'Ohne Titel',
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
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const parsedContent = useMemo(() => splitItemContent(data.content), [data.content])
  const title =
    parsedContent.title ||
    (!data.content.trim() && data.title === 'Ohne Titel' ? '' : data.title)
  const body = parsedContent.body
  const [menuSelection, setMenuSelection] = useState<{
    selectionStart: number
    selectionEnd: number
  } | null>(null)

  function updateTitle(nextTitle: string) {
    data.onUpdateContent(data.itemId, composeItemContent(nextTitle, body))
  }

  function updateBody(nextBody: string) {
    data.onUpdateContent(data.itemId, composeItemContent(title, nextBody))
  }

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
    if (!data.autoFocusBody) {
      return
    }

    if (!title.trim() && titleInputRef.current) {
      titleInputRef.current.focus()
      const length = titleInputRef.current.value.length
      titleInputRef.current.setSelectionRange(length, length)
      data.onAutoFocusHandled(data.itemId)
      return
    }

    if (!textareaRef.current) {
      return
    }

    textareaRef.current.focus()
    const length = textareaRef.current.value.length
    textareaRef.current.setSelectionRange(length, length)
    data.onAutoFocusHandled(data.itemId)
  }, [data, title])

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
          <input
            ref={titleInputRef}
            className="canvas-note-title nodrag nowheel"
            placeholder="Titel"
            value={title}
            onChange={(event) => updateTitle(event.target.value)}
            onPointerDown={(event) => event.stopPropagation()}
          />
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
          value={body}
          onChange={(event) => updateBody(event.target.value)}
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

                const bodyOffset = title.trim() ? `# ${title.trim()}\n\n`.length : 0
                const cursor = await data.onInsertImage(
                  data.itemId,
                  menuSelection.selectionStart + bodyOffset,
                  menuSelection.selectionEnd + bodyOffset,
                )
                setMenuSelection(null)
                if (cursor !== null && textareaRef.current) {
                  const nextCursor = Math.max(0, cursor - bodyOffset)
                  textareaRef.current.focus()
                  textareaRef.current.setSelectionRange(nextCursor, nextCursor)
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
