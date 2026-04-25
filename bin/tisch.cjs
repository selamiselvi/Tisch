#!/usr/bin/env node
const fs = require('node:fs')
const store = require('../lib/workspace-store.cjs')

function usage() {
  return `Usage:
  tisch workspace path
  tisch workspace init
  tisch project list
  tisch project create --name <name> [--description <text>] [--accent <color>]
  tisch zettel create --project <id-or-name> --title <title> [--body <text>|--body-file <path>]
  tisch board list [--project <id-or-name>]
  tisch board create --project <id-or-name> --title <title> [--column <title> ...]
  tisch board add-column --board <id-or-title> --title <title> [--project <id-or-name>]
  tisch board add-card --board <id-or-title> --column <id-or-title> [--item <id-or-title>|--title <title>] [--body <text>|--body-file <path>] [--project <id-or-name>]
  tisch board move-card --board <id-or-title> --card <id-or-item-or-title> --column <id-or-title> [--before <card-or-item-or-title>] [--project <id-or-name>]
  tisch canvas list [--project <id-or-name>]
  tisch canvas create --project <id-or-name> --title <title>
  tisch canvas add-node --canvas <id-or-title> --title <title> [--body <text>|--body-file <path>] [--x <n>] [--y <n>]
  tisch canvas connect --canvas <id-or-title> --from <node-or-item-or-title> --to <node-or-item-or-title>

Environment:
  TISCH_WORKSPACE_DIR overrides the workspace path.
  PLANNER_WORKSPACE_DIR is still supported for development compatibility.`
}

function parseArgs(argv) {
  const positionals = []
  const options = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) {
      positionals.push(arg)
      continue
    }

    const [rawKey, inlineValue] = arg.slice(2).split(/=(.*)/s)
    const next = argv[index + 1]
    const value =
      inlineValue !== undefined
        ? inlineValue
        : next && !next.startsWith('--')
          ? (index += 1, next)
          : true

    if (options[rawKey] === undefined) {
      options[rawKey] = value
    } else if (Array.isArray(options[rawKey])) {
      options[rawKey].push(value)
    } else {
      options[rawKey] = [options[rawKey], value]
    }
  }

  return { positionals, options }
}

function required(options, key) {
  const value = options[key]
  if (value === undefined || value === true || String(value).trim() === '') {
    throw new Error(`Missing required option: --${key}`)
  }
  return String(value)
}

function optionalNumber(options, key) {
  if (options[key] === undefined || options[key] === true) {
    return undefined
  }

  const value = Number(options[key])
  if (!Number.isFinite(value)) {
    throw new Error(`--${key} must be a number.`)
  }

  return value
}

function asArray(value) {
  if (value === undefined) {
    return []
  }
  return Array.isArray(value) ? value.map(String) : [String(value)]
}

function csvOrArray(value) {
  return asArray(value)
    .flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function readBody(options) {
  if (options['body-file']) {
    return fs.readFileSync(String(options['body-file']), 'utf8')
  }

  return options.body === undefined || options.body === true ? '' : String(options.body)
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

function loadPlanner() {
  return store.loadOrCreateWorkspace(store.getDefaultWorkspaceDir())
}

function savePlanner(planner) {
  return store.saveWorkspace(store.getDefaultWorkspaceDir(), planner)
}

function mutatePlanner(callback) {
  const workspaceDir = store.getDefaultWorkspaceDir()
  return store.withWorkspaceLock(workspaceDir, () => {
    const planner = store.loadOrCreateWorkspace(workspaceDir)
    const result = callback(planner)
    const saved = result.planner ? store.saveWorkspace(workspaceDir, result.planner) : planner
    return { ...result, saved }
  })
}

function resolveProject(planner, projectRef) {
  const project = store.findProject(planner, projectRef)
  if (!project) {
    throw new Error(`Project not found: ${projectRef}`)
  }
  return project
}

function run(argv) {
  const { positionals, options } = parseArgs(argv)
  const [area, action] = positionals

  if (!area || options.help || options.h) {
    process.stdout.write(`${usage()}\n`)
    return
  }

  if (area === 'workspace' && action === 'path') {
    process.stdout.write(`${store.getDefaultWorkspaceDir()}\n`)
    return
  }

  if (area === 'workspace' && action === 'init') {
    const planner = loadPlanner()
    printJson({
      workspacePath: store.getDefaultWorkspaceDir(),
      plannerPath: store.getPlannerPath(store.getDefaultWorkspaceDir()),
      projects: planner.projects.length,
      items: planner.items.length,
      boards: planner.boards.length,
      canvases: planner.canvases.length,
    })
    return
  }

  if (area === 'project' && action === 'list') {
    const planner = loadPlanner()
    printJson(planner.projects)
    return
  }

  if (area === 'project' && action === 'create') {
    const result = mutatePlanner((planner) => {
      const next = store.createProject(planner, {
        name: required(options, 'name'),
        description: options.description ? String(options.description) : '',
        accent: options.accent ? String(options.accent) : undefined,
        forceNew: Boolean(options['force-new']),
      })
      return next.created ? next : { ...next, planner: null }
    })
    printJson({
      created: result.created,
      project: result.project,
      updatedAt: result.saved.updatedAt,
    })
    return
  }

  if ((area === 'zettel' || area === 'script') && action === 'create') {
    const result = mutatePlanner((planner) =>
      store.createScript(planner, {
        project: required(options, 'project'),
        title: required(options, 'title'),
        body: readBody(options),
        status: options.status ? String(options.status) : undefined,
      }),
    )
    printJson({ item: result.item, updatedAt: result.saved.updatedAt })
    return
  }

  if (area === 'board' && action === 'list') {
    const planner = loadPlanner()
    const project = options.project
      ? resolveProject(planner, String(options.project))
      : null
    const boards = project
      ? planner.boards.filter((board) => board.projectId === project.id)
      : planner.boards
    printJson(boards)
    return
  }

  if (area === 'board' && action === 'create') {
    const result = mutatePlanner((planner) =>
      store.createBoard(planner, {
        project: required(options, 'project'),
        title: required(options, 'title'),
        columns: csvOrArray(options.column),
      }),
    )
    printJson({ board: result.board, updatedAt: result.saved.updatedAt })
    return
  }

  if (area === 'board' && action === 'add-column') {
    const result = mutatePlanner((planner) => {
      const project = options.project
        ? resolveProject(planner, String(options.project))
        : null
      const next = store.addBoardColumn(planner, {
        board: required(options, 'board'),
        projectId: project?.id,
        title: required(options, 'title'),
        forceNew: Boolean(options['force-new']),
      })
      return next.created ? next : { ...next, planner: null }
    })
    printJson({
      created: result.created,
      boardId: result.boardId,
      column: result.column,
      updatedAt: result.saved.updatedAt,
    })
    return
  }

  if (area === 'board' && action === 'add-card') {
    const result = mutatePlanner((planner) => {
      const project = options.project
        ? resolveProject(planner, String(options.project))
        : null
      const item = options.item ? String(options.item) : undefined
      const title = item ? options.title : required(options, 'title')
      const next = store.addBoardCard(planner, {
        board: required(options, 'board'),
        projectId: project?.id,
        column: required(options, 'column'),
        item,
        title: title ? String(title) : undefined,
        body: readBody(options),
        allowDuplicate: Boolean(options['allow-duplicate']),
      })
      return next.created ? next : { ...next, planner: null }
    })
    printJson({
      created: result.created,
      boardId: result.boardId,
      card: result.card,
      item: result.item,
      updatedAt: result.saved.updatedAt,
    })
    return
  }

  if (area === 'board' && action === 'move-card') {
    const result = mutatePlanner((planner) => {
      const project = options.project
        ? resolveProject(planner, String(options.project))
        : null
      return store.moveBoardCard(planner, {
        board: required(options, 'board'),
        projectId: project?.id,
        card: required(options, 'card'),
        column: required(options, 'column'),
        before: options.before ? String(options.before) : undefined,
      })
    })
    printJson({
      boardId: result.boardId,
      card: result.card,
      updatedAt: result.saved.updatedAt,
    })
    return
  }

  if (area === 'canvas' && action === 'list') {
    const planner = loadPlanner()
    const project = options.project
      ? resolveProject(planner, String(options.project))
      : null
    const canvases = project
      ? planner.canvases.filter((canvas) => canvas.projectId === project.id)
      : planner.canvases
    printJson(canvases)
    return
  }

  if (area === 'canvas' && action === 'create') {
    const result = mutatePlanner((planner) =>
      store.createCanvas(planner, {
        project: required(options, 'project'),
        title: required(options, 'title'),
      }),
    )
    printJson({ canvas: result.canvas, updatedAt: result.saved.updatedAt })
    return
  }

  if (area === 'canvas' && action === 'add-node') {
    const result = mutatePlanner((planner) => {
      const project = options.project
        ? resolveProject(planner, String(options.project))
        : null
      return store.addCanvasNode(planner, {
        canvas: required(options, 'canvas'),
        projectId: project?.id,
        title: required(options, 'title'),
        body: readBody(options),
        status: options.status ? String(options.status) : undefined,
        x: optionalNumber(options, 'x'),
        y: optionalNumber(options, 'y'),
        width: optionalNumber(options, 'width'),
        height: optionalNumber(options, 'height'),
      })
    })
    printJson({
      canvasId: result.canvasId,
      node: result.node,
      item: result.item,
      updatedAt: result.saved.updatedAt,
    })
    return
  }

  if (area === 'canvas' && action === 'connect') {
    const result = mutatePlanner((planner) => {
      const project = options.project
        ? resolveProject(planner, String(options.project))
        : null
      const next = store.connectCanvasNodes(planner, {
        canvas: required(options, 'canvas'),
        projectId: project?.id,
        from: required(options, 'from'),
        to: required(options, 'to'),
        sourceHandle: options['source-handle']
          ? String(options['source-handle'])
          : undefined,
        targetHandle: options['target-handle']
          ? String(options['target-handle'])
          : undefined,
      })
      return next.created ? next : { ...next, planner: null }
    })
    printJson({
      created: result.created,
      edge: result.edge,
      updatedAt: result.saved.updatedAt,
    })
    return
  }

  throw new Error(`Unknown command: ${positionals.join(' ')}`)
}

try {
  run(process.argv.slice(2))
} catch (error) {
  process.stderr.write(`${error.message}\n\n${usage()}\n`)
  process.exitCode = 1
}
