const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')

const schemaVersion = 2

function createId(prefix, length = 8) {
  return `${prefix}-${crypto
    .randomBytes(Math.ceil(length * 0.75))
    .toString('base64url')
    .slice(0, length)}`
}

function slugify(value) {
  return (
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'item'
  )
}

function normalizeLineEndings(value) {
  return String(value || '').replace(/\r\n?/g, '\n')
}

function composeItemContent(title, body = '') {
  const nextTitle = String(title || '').replace(/^\s+/, '')
  const nextBody = normalizeLineEndings(body).replace(/^\n+/, '')

  if (!nextTitle.trim()) {
    return nextBody
  }

  return nextBody ? `# ${nextTitle}\n\n${nextBody}` : `# ${nextTitle}`
}

function deriveSummary(markdown, fallback = '') {
  return (
    normalizeLineEndings(markdown)
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
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

function buildItemContentPath(projectId, title, itemId) {
  const slug =
    slugify(`${projectId || 'projekt'}-${title || 'ohne-titel'}-${itemId.slice(-4)}`) ||
    `item-${itemId.slice(-4)}`
  return path.posix.join('pages', `${slug}.md`)
}

function getDefaultWorkspaceDir() {
  if (process.env.TISCH_WORKSPACE_DIR) {
    return process.env.TISCH_WORKSPACE_DIR
  }

  if (process.env.PLANNER_WORKSPACE_DIR) {
    return process.env.PLANNER_WORKSPACE_DIR
  }

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Tisch', 'workspace')
  }

  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'Tisch',
      'workspace',
    )
  }

  return path.join(
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
    'Tisch',
    'workspace',
  )
}

function getWorkspaceDir(workspaceDir) {
  return workspaceDir || getDefaultWorkspaceDir()
}

function getPlannerPath(workspaceDir) {
  return path.join(getWorkspaceDir(workspaceDir), 'planner.json')
}

function getPagesDir(workspaceDir) {
  return path.join(getWorkspaceDir(workspaceDir), 'pages')
}

function getImagesDir(workspaceDir) {
  return path.join(getWorkspaceDir(workspaceDir), 'images')
}

function getLockPath(workspaceDir) {
  return path.join(getWorkspaceDir(workspaceDir), '.tisch.lock')
}

function ensureWorkspace(workspaceDir) {
  fs.mkdirSync(getPagesDir(workspaceDir), { recursive: true })
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return null
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function createEmptyPlanner() {
  return {
    schemaVersion,
    updatedAt: new Date().toISOString(),
    projects: [],
    items: [],
    boards: [],
    canvases: [],
    links: [],
  }
}

function normalizePlanner(input) {
  if (!input || input.schemaVersion !== schemaVersion || !Array.isArray(input.items)) {
    return createEmptyPlanner()
  }

  return {
    schemaVersion,
    updatedAt: input.updatedAt || new Date().toISOString(),
    projects: Array.isArray(input.projects) ? input.projects : [],
    items: input.items.map((item) =>
      item.kind === 'script' || item.kind === undefined
        ? item
        : { ...item, kind: 'script' },
    ),
    boards: Array.isArray(input.boards) ? input.boards : [],
    canvases: Array.isArray(input.canvases) ? input.canvases : [],
    links: Array.isArray(input.links) ? input.links : [],
  }
}

function readItemContent(workspaceDir, item) {
  if (!item.contentPath) {
    return ''
  }

  const fullPath = path.join(getWorkspaceDir(workspaceDir), item.contentPath)
  if (!fs.existsSync(fullPath)) {
    return ''
  }

  return fs.readFileSync(fullPath, 'utf8')
}

function writeItemContent(workspaceDir, item) {
  if (!item.contentPath) {
    return
  }

  const fullPath = path.join(getWorkspaceDir(workspaceDir), item.contentPath)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, item.content || '', 'utf8')
}

function loadWorkspace(workspaceDir) {
  ensureWorkspace(workspaceDir)
  const data = readJson(getPlannerPath(workspaceDir))

  if (!data) {
    return null
  }

  const normalized = normalizePlanner(data)
  return {
    ...normalized,
    items: normalized.items.map((item) => ({
      ...item,
      content: readItemContent(workspaceDir, item),
    })),
  }
}

function loadOrCreateWorkspace(workspaceDir) {
  return loadWorkspace(workspaceDir) || saveWorkspace(workspaceDir, createEmptyPlanner())
}

function saveWorkspace(workspaceDir, data) {
  ensureWorkspace(workspaceDir)
  const now = new Date().toISOString()
  const normalized = normalizePlanner(data)
  const items = normalized.items.map((item) => {
    writeItemContent(workspaceDir, item)
    const { content, ...metadata } = item
    return metadata
  })

  const fileData = {
    ...normalized,
    items,
    updatedAt: now,
  }

  const plannerPath = getPlannerPath(workspaceDir)
  const tempPath = `${plannerPath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tempPath, `${JSON.stringify(fileData, null, 2)}\n`, 'utf8')
  fs.renameSync(tempPath, plannerPath)

  return {
    ...fileData,
    items: normalized.items,
  }
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function withWorkspaceLock(workspaceDir, callback, options = {}) {
  ensureWorkspace(workspaceDir)

  const timeoutMs = options.timeoutMs ?? 10_000
  const staleMs = options.staleMs ?? 30_000
  const startedAt = Date.now()
  const lockPath = getLockPath(workspaceDir)
  let fd = null

  while (fd === null) {
    try {
      fd = fs.openSync(lockPath, 'wx')
      fs.writeFileSync(
        fd,
        JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }),
        'utf8',
      )
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error
      }

      try {
        const stats = fs.statSync(lockPath)
        if (Date.now() - stats.mtimeMs > staleMs) {
          fs.unlinkSync(lockPath)
          continue
        }
      } catch (statError) {
        if (statError.code !== 'ENOENT') {
          throw statError
        }
      }

      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Timed out waiting for workspace lock: ${lockPath}`)
      }

      sleepSync(50)
    }
  }

  try {
    return callback()
  } finally {
    fs.closeSync(fd)
    try {
      fs.unlinkSync(lockPath)
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
  }
}

function sanitizeFileStem(value) {
  return (
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'image'
  )
}

function importImage(workspaceDir, sourcePath) {
  ensureWorkspace(workspaceDir)
  fs.mkdirSync(getImagesDir(workspaceDir), { recursive: true })

  const extension = path.extname(sourcePath) || '.png'
  const stem = sanitizeFileStem(path.basename(sourcePath, extension))
  const fileName = `${stem}-${Date.now()}${extension.toLowerCase()}`
  const relativePath = path.posix.join('images', fileName)
  const targetPath = path.join(getWorkspaceDir(workspaceDir), relativePath)

  fs.copyFileSync(sourcePath, targetPath)

  return relativePath
}

function findProject(planner, projectRef) {
  const ref = String(projectRef || '').trim().toLowerCase()
  if (!ref) {
    return null
  }

  return (
    planner.projects.find(
      (project) =>
        project.id.toLowerCase() === ref || project.name.toLowerCase() === ref,
    ) || null
  )
}

function findCanvas(planner, canvasRef, projectId) {
  const ref = String(canvasRef || '').trim().toLowerCase()
  if (!ref) {
    return null
  }

  return (
    planner.canvases.find(
      (canvas) =>
        (!projectId || canvas.projectId === projectId) &&
        (canvas.id.toLowerCase() === ref || canvas.title.toLowerCase() === ref),
    ) || null
  )
}

function findBoard(planner, boardRef, projectId) {
  const ref = String(boardRef || '').trim().toLowerCase()
  if (!ref) {
    return null
  }

  return (
    planner.boards.find(
      (board) =>
        (!projectId || board.projectId === projectId) &&
        (board.id.toLowerCase() === ref || board.title.toLowerCase() === ref),
    ) || null
  )
}

function findBoardColumn(board, columnRef) {
  const ref = String(columnRef || '').trim().toLowerCase()
  if (!ref) {
    return null
  }

  return (
    board.columns.find(
      (column) =>
        column.id.toLowerCase() === ref || column.title.toLowerCase() === ref,
    ) || null
  )
}

function findCanvasNode(planner, canvas, nodeRef) {
  const ref = String(nodeRef || '').trim().toLowerCase()
  if (!ref) {
    return null
  }

  return (
    canvas.nodes.find((node) => {
      if (node.id.toLowerCase() === ref || node.itemId.toLowerCase() === ref) {
        return true
      }

      const item = planner.items.find((entry) => entry.id === node.itemId)
      return item?.title.toLowerCase() === ref
    }) || null
  )
}

function findItem(planner, itemRef, projectId) {
  const ref = String(itemRef || '').trim().toLowerCase()
  if (!ref) {
    return null
  }

  return (
    planner.items.find(
      (item) =>
        (!projectId || item.projectId === projectId) &&
        (item.id.toLowerCase() === ref || item.title.toLowerCase() === ref),
    ) || null
  )
}

function findBoardCard(planner, board, cardRef) {
  const ref = String(cardRef || '').trim().toLowerCase()
  if (!ref) {
    return null
  }

  return (
    board.cards.find((card) => {
      if (card.id.toLowerCase() === ref || card.itemId.toLowerCase() === ref) {
        return true
      }

      const item = planner.items.find((entry) => entry.id === card.itemId)
      return item?.title.toLowerCase() === ref
    }) || null
  )
}

function updateItemStatus(items, itemId, status) {
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

function createProject(planner, options) {
  const now = new Date().toISOString()
  const name = String(options.name || '').trim()
  if (!name) {
    throw new Error('Project name is required.')
  }

  const existing = findProject(planner, name)
  if (existing && !options.forceNew) {
    return { planner, project: existing, created: false }
  }

  const project = {
    id: options.id || slugify(name),
    name,
    accent: options.accent || '#2563eb',
    description: options.description || '',
  }

  return {
    planner: {
      ...planner,
      projects: [...planner.projects, project],
      updatedAt: now,
    },
    project,
    created: true,
  }
}

function createScript(planner, options) {
  const project = findProject(planner, options.project)
  if (!project) {
    throw new Error(`Project not found: ${options.project}`)
  }

  const now = new Date().toISOString()
  const title = String(options.title || 'Neuer Zettel').trim()
  const body = options.body || ''
  const id = options.id || createId('item')
  const content = options.content ?? composeItemContent(title, body)
  const item = {
    id,
    projectId: project.id,
    title,
    summary: options.summary ?? deriveSummary(body || content, ''),
    contentPath: options.contentPath || buildItemContentPath(project.id, title, id),
    content,
    tags: options.tags || [],
    status: options.status || 'planung',
    done: Boolean(options.done),
    kind: 'script',
    createdAt: now,
    updatedAt: now,
  }

  return {
    planner: {
      ...planner,
      items: [item, ...planner.items],
      updatedAt: now,
    },
    item,
  }
}

function createCanvas(planner, options) {
  const project = findProject(planner, options.project)
  if (!project) {
    throw new Error(`Project not found: ${options.project}`)
  }

  const canvas = {
    id: options.id || createId('canvas', 6),
    title: String(options.title || 'Canvas').trim(),
    projectId: project.id,
    nodes: [],
    edges: [],
  }

  return {
    planner: {
      ...planner,
      canvases: [...planner.canvases, canvas],
      updatedAt: new Date().toISOString(),
    },
    canvas,
  }
}

function createBoard(planner, options) {
  const project = findProject(planner, options.project)
  if (!project) {
    throw new Error(`Project not found: ${options.project}`)
  }

  const columns =
    Array.isArray(options.columns) && options.columns.length > 0
      ? options.columns
      : ['Planung', 'In Arbeit', 'Fertig']
  const board = {
    id: options.id || createId('board', 6),
    title: String(options.title || 'Board').trim(),
    projectId: project.id,
    columns: columns.map((title) => ({
      id: createId('col', 5),
      title: String(title || 'Neue Spalte').trim() || 'Neue Spalte',
    })),
    cards: [],
  }

  return {
    planner: {
      ...planner,
      boards: [...planner.boards, board],
      updatedAt: new Date().toISOString(),
    },
    board,
  }
}

function addBoardColumn(planner, options) {
  const board = findBoard(planner, options.board, options.projectId)
  if (!board) {
    throw new Error(`Board not found: ${options.board}`)
  }

  const title = String(options.title || 'Neue Spalte').trim() || 'Neue Spalte'
  const existing = findBoardColumn(board, title)
  if (existing && !options.forceNew) {
    return { planner, boardId: board.id, column: existing, created: false }
  }

  const column = {
    id: options.id || createId('col', 5),
    title,
  }

  return {
    planner: {
      ...planner,
      boards: planner.boards.map((entry) =>
        entry.id === board.id
          ? { ...entry, columns: [...entry.columns, column] }
          : entry,
      ),
      updatedAt: new Date().toISOString(),
    },
    boardId: board.id,
    column,
    created: true,
  }
}

function addBoardCard(planner, options) {
  const board = findBoard(planner, options.board, options.projectId)
  if (!board) {
    throw new Error(`Board not found: ${options.board}`)
  }

  const column = findBoardColumn(board, options.column)
  if (!column) {
    throw new Error(`Column not found: ${options.column}`)
  }

  let nextPlanner = planner
  let item = options.item
    ? findItem(planner, options.item, board.projectId)
    : null

  if (options.item && !item) {
    throw new Error(`Item not found: ${options.item}`)
  }

  if (!item) {
    const result = createScript(nextPlanner, {
      project: board.projectId,
      title: options.title || 'Neue Karte',
      body: options.body || '',
      tags: options.tags || [],
      status: column.id,
    })
    nextPlanner = result.planner
    item = result.item
  } else {
    const nextItems = updateItemStatus(nextPlanner.items, item.id, column.id)
    nextPlanner = {
      ...nextPlanner,
      items: nextItems,
    }
    item = nextItems.find((entry) => entry.id === item.id) || item
  }

  const existing = board.cards.find((card) => card.itemId === item.id)
  if (existing && !options.allowDuplicate) {
    return {
      planner: nextPlanner,
      boardId: board.id,
      card: existing,
      item,
      created: false,
    }
  }

  const card = {
    id: options.id || createId('card'),
    itemId: item.id,
    columnId: column.id,
  }

  return {
    planner: {
      ...nextPlanner,
      boards: nextPlanner.boards.map((entry) =>
        entry.id === board.id ? { ...entry, cards: [...entry.cards, card] } : entry,
      ),
      updatedAt: new Date().toISOString(),
    },
    boardId: board.id,
    card,
    item,
    created: true,
  }
}

function moveBoardCard(planner, options) {
  const board = findBoard(planner, options.board, options.projectId)
  if (!board) {
    throw new Error(`Board not found: ${options.board}`)
  }

  const card = findBoardCard(planner, board, options.card)
  if (!card) {
    throw new Error(`Card not found: ${options.card}`)
  }

  const column = findBoardColumn(board, options.column)
  if (!column) {
    throw new Error(`Column not found: ${options.column}`)
  }

  const beforeCard = options.before
    ? findBoardCard(planner, board, options.before)
    : null
  if (options.before && !beforeCard) {
    throw new Error(`Before card not found: ${options.before}`)
  }

  const remainingCards = board.cards.filter((entry) => entry.id !== card.id)
  const beforeCardId =
    beforeCard && beforeCard.id !== card.id && beforeCard.columnId === column.id
      ? beforeCard.id
      : null
  const nextCard = { ...card, columnId: column.id }
  let insertIndex = remainingCards.length

  if (beforeCardId) {
    insertIndex = remainingCards.findIndex((entry) => entry.id === beforeCardId)
  } else {
    let lastTargetIndex = -1
    remainingCards.forEach((entry, index) => {
      if (entry.columnId === column.id) {
        lastTargetIndex = index
      }
    })
    insertIndex = lastTargetIndex === -1 ? remainingCards.length : lastTargetIndex + 1
  }

  const nextCards = [...remainingCards]
  nextCards.splice(insertIndex, 0, nextCard)

  return {
    planner: {
      ...planner,
      boards: planner.boards.map((entry) =>
        entry.id === board.id ? { ...entry, cards: nextCards } : entry,
      ),
      items: updateItemStatus(planner.items, card.itemId, column.id),
      updatedAt: new Date().toISOString(),
    },
    boardId: board.id,
    card: nextCard,
  }
}

function addCanvasNode(planner, options) {
  const canvas = findCanvas(planner, options.canvas, options.projectId)
  if (!canvas) {
    throw new Error(`Canvas not found: ${options.canvas}`)
  }

  let nextPlanner = planner
  let item = options.itemId
    ? planner.items.find((entry) => entry.id === options.itemId)
    : null

  if (!item) {
    const result = createScript(nextPlanner, {
      project: canvas.projectId,
      title: options.title || 'Neue Node',
      body: options.body || '',
      tags: options.tags || [],
      status: options.status || 'planung',
    })
    nextPlanner = result.planner
    item = result.item
  }

  const node = {
    id: options.id || createId('node'),
    itemId: item.id,
    x: Number.isFinite(options.x) ? options.x : 150 + canvas.nodes.length * 36,
    y: Number.isFinite(options.y) ? options.y : 140 + canvas.nodes.length * 32,
    width: Number.isFinite(options.width) ? options.width : 340,
    height: Number.isFinite(options.height) ? options.height : 208,
  }

  return {
    planner: {
      ...nextPlanner,
      canvases: nextPlanner.canvases.map((entry) =>
        entry.id === canvas.id ? { ...entry, nodes: [...entry.nodes, node] } : entry,
      ),
      updatedAt: new Date().toISOString(),
    },
    item,
    node,
    canvasId: canvas.id,
  }
}

function connectCanvasNodes(planner, options) {
  const canvas = findCanvas(planner, options.canvas, options.projectId)
  if (!canvas) {
    throw new Error(`Canvas not found: ${options.canvas}`)
  }

  const source = findCanvasNode(planner, canvas, options.from)
  const target = findCanvasNode(planner, canvas, options.to)
  if (!source) {
    throw new Error(`Source node not found: ${options.from}`)
  }
  if (!target) {
    throw new Error(`Target node not found: ${options.to}`)
  }
  if (source.id === target.id) {
    throw new Error('Cannot connect a node to itself.')
  }

  const existing = canvas.edges.find(
    (edge) => edge.source === source.id && edge.target === target.id,
  )
  if (existing) {
    return { planner, edge: existing, created: false }
  }

  const edge = {
    id: options.id || createId('edge'),
    source: source.id,
    target: target.id,
    sourceHandle: options.sourceHandle || undefined,
    targetHandle: options.targetHandle || undefined,
  }

  return {
    planner: {
      ...planner,
      canvases: planner.canvases.map((entry) =>
        entry.id === canvas.id ? { ...entry, edges: [...entry.edges, edge] } : entry,
      ),
      updatedAt: new Date().toISOString(),
    },
    edge,
    created: true,
  }
}

module.exports = {
  addCanvasNode,
  addBoardCard,
  addBoardColumn,
  buildItemContentPath,
  composeItemContent,
  connectCanvasNodes,
  createBoard,
  createCanvas,
  createEmptyPlanner,
  createId,
  createProject,
  createScript,
  deriveSummary,
  ensureWorkspace,
  findBoard,
  findBoardCard,
  findBoardColumn,
  findCanvas,
  findCanvasNode,
  findItem,
  findProject,
  getDefaultWorkspaceDir,
  getImagesDir,
  getLockPath,
  getPagesDir,
  getPlannerPath,
  getWorkspaceDir,
  importImage,
  loadOrCreateWorkspace,
  loadWorkspace,
  normalizePlanner,
  saveWorkspace,
  schemaVersion,
  slugify,
  moveBoardCard,
  withWorkspaceLock,
}
