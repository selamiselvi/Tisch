const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const isDev = !app.isPackaged
const workspaceDir =
  process.env.PLANNER_WORKSPACE_DIR || path.join(process.cwd(), 'workspace')
const plannerPath = path.join(workspaceDir, 'planner.json')
const pagesDir = path.join(workspaceDir, 'pages')

function ensureWorkspace() {
  fs.mkdirSync(pagesDir, { recursive: true })
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return null
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function readItemContent(item) {
  if (!item.contentPath) {
    return ''
  }

  const fullPath = path.join(workspaceDir, item.contentPath)
  if (!fs.existsSync(fullPath)) {
    return ''
  }

  return fs.readFileSync(fullPath, 'utf8')
}

function writeItemContent(item) {
  if (!item.contentPath) {
    return
  }

  const fullPath = path.join(workspaceDir, item.contentPath)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, item.content || '', 'utf8')
}

function loadWorkspace() {
  ensureWorkspace()
  const data = readJson(plannerPath)

  if (!data) {
    return null
  }

  return {
    ...data,
    items: (data.items || []).map((item) => ({
      ...item,
      content: readItemContent(item),
    })),
  }
}

function saveWorkspace(data) {
  ensureWorkspace()
  const now = new Date().toISOString()
  const items = (data.items || []).map((item) => {
    writeItemContent(item)
    const { content, ...metadata } = item
    return metadata
  })

  const fileData = {
    ...data,
    items,
    updatedAt: now,
  }

  fs.writeFileSync(plannerPath, `${JSON.stringify(fileData, null, 2)}\n`, 'utf8')

  return {
    ...fileData,
    items: data.items || [],
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1160,
    minHeight: 760,
    title: 'Tisch',
    backgroundColor: '#f7f7f5',
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
