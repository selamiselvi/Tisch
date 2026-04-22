const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const isDev = !app.isPackaged
const workspaceDir =
  process.env.PLANNER_WORKSPACE_DIR || path.join(process.cwd(), 'workspace')
const plannerPath = path.join(workspaceDir, 'planner.json')
const notesDir = path.join(workspaceDir, 'notes')

function ensureWorkspace() {
  fs.mkdirSync(notesDir, { recursive: true })
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return null
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function readNoteContent(note) {
  if (!note.path) {
    return ''
  }

  const fullPath = path.join(workspaceDir, note.path)
  if (!fs.existsSync(fullPath)) {
    return ''
  }

  return fs.readFileSync(fullPath, 'utf8')
}

function writeNoteContent(note) {
  if (!note.path) {
    return
  }

  const fullPath = path.join(workspaceDir, note.path)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, note.content || '', 'utf8')
}

function loadWorkspace() {
  ensureWorkspace()
  const data = readJson(plannerPath)

  if (!data) {
    return null
  }

  return {
    ...data,
    notes: (data.notes || []).map((note) => ({
      ...note,
      content: readNoteContent(note),
    })),
  }
}

function saveWorkspace(data) {
  ensureWorkspace()
  const now = new Date().toISOString()
  const notes = (data.notes || []).map((note) => {
    writeNoteContent(note)
    const { content, ...metadata } = note
    return metadata
  })

  const fileData = {
    ...data,
    notes,
    updatedAt: now,
  }

  fs.writeFileSync(plannerPath, `${JSON.stringify(fileData, null, 2)}\n`, 'utf8')

  return {
    ...fileData,
    notes: data.notes || [],
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1160,
    minHeight: 760,
    title: 'Social Media Planning',
    backgroundColor: '#f6f5f1',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    win.loadURL('http://127.0.0.1:5173')
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(() => {
  ipcMain.handle('planner:getWorkspacePath', () => workspaceDir)
  ipcMain.handle('planner:loadWorkspace', () => loadWorkspace())
  ipcMain.handle('planner:saveWorkspace', (_event, data) => saveWorkspace(data))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
