const { app, BrowserWindow, dialog, ipcMain, nativeImage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const isDev = !app.isPackaged
const legacyWorkspaceDir = path.join(process.cwd(), 'workspace')

function getWorkspaceDir() {
  return (
    process.env.PLANNER_WORKSPACE_DIR ||
    path.join(app.getPath('userData'), 'workspace')
  )
}

function getPlannerPath() {
  return path.join(getWorkspaceDir(), 'planner.json')
}

function getPagesDir() {
  return path.join(getWorkspaceDir(), 'pages')
}

function getImagesDir() {
  return path.join(getWorkspaceDir(), 'images')
}

function getWindowIconPath() {
  return isDev
    ? path.join(process.cwd(), 'public', 'tisch-mark.svg')
    : path.join(__dirname, '..', 'dist', 'tisch-mark.svg')
}

function ensureWorkspace() {
  fs.mkdirSync(getPagesDir(), { recursive: true })
}

function sanitizeFileStem(value) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'image'
  )
}

function hasWorkspaceData(dirPath) {
  return fs.existsSync(path.join(dirPath, 'planner.json'))
}

function migrateLegacyWorkspace() {
  if (process.env.PLANNER_WORKSPACE_DIR) {
    return
  }

  const workspaceDir = getWorkspaceDir()
  if (hasWorkspaceData(workspaceDir) || !hasWorkspaceData(legacyWorkspaceDir)) {
    return
  }

  fs.mkdirSync(workspaceDir, { recursive: true })
  fs.cpSync(legacyWorkspaceDir, workspaceDir, {
    recursive: true,
    force: false,
    errorOnExist: false,
  })
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

  const fullPath = path.join(getWorkspaceDir(), item.contentPath)
  if (!fs.existsSync(fullPath)) {
    return ''
  }

  return fs.readFileSync(fullPath, 'utf8')
}

function writeItemContent(item) {
  if (!item.contentPath) {
    return
  }

  const fullPath = path.join(getWorkspaceDir(), item.contentPath)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, item.content || '', 'utf8')
}

function loadWorkspace() {
  ensureWorkspace()
  const data = readJson(getPlannerPath())

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

  fs.writeFileSync(
    getPlannerPath(),
    `${JSON.stringify(fileData, null, 2)}\n`,
    'utf8',
  )

  return {
    ...fileData,
    items: data.items || [],
  }
}

function importImage(sourcePath) {
  ensureWorkspace()
  fs.mkdirSync(getImagesDir(), { recursive: true })

  const extension = path.extname(sourcePath) || '.png'
  const stem = sanitizeFileStem(path.basename(sourcePath, extension))
  const fileName = `${stem}-${Date.now()}${extension.toLowerCase()}`
  const relativePath = path.posix.join('images', fileName)
  const targetPath = path.join(getWorkspaceDir(), relativePath)

  fs.copyFileSync(sourcePath, targetPath)

  return relativePath
}

async function pickImage() {
  const win = BrowserWindow.getFocusedWindow()
  const result = await dialog.showOpenDialog(win ?? undefined, {
    title: 'Bild auswählen',
    properties: ['openFile'],
    filters: [
      {
        name: 'Bilder',
        extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'],
      },
    ],
  })

  if (result.canceled || !result.filePaths[0]) {
    return null
  }

  return importImage(result.filePaths[0])
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1160,
    minHeight: 760,
    title: 'Tisch',
    backgroundColor: '#f7f7f5',
    icon: nativeImage.createFromPath(getWindowIconPath()),
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
  migrateLegacyWorkspace()

  ipcMain.handle('planner:getWorkspacePath', () => getWorkspaceDir())
  ipcMain.handle('planner:loadWorkspace', () => loadWorkspace())
  ipcMain.handle('planner:saveWorkspace', (_event, data) => saveWorkspace(data))
  ipcMain.handle('planner:pickImage', () => pickImage())

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
