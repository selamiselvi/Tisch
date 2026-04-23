const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  protocol,
} = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const workspaceStore = require('../lib/workspace-store.cjs')

const isDev = !app.isPackaged
const legacyWorkspaceDir = path.join(process.cwd(), 'workspace')
let workspaceWatcher = null
let workspaceWatchTimer = null

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'tisch-asset',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

app.setName('Tisch')

function getWorkspaceDir() {
  return (
    process.env.PLANNER_WORKSPACE_DIR ||
    path.join(app.getPath('userData'), 'workspace')
  )
}

function getPlannerPath() {
  return workspaceStore.getPlannerPath(getWorkspaceDir())
}

function getWindowIconPath() {
  return isDev
    ? path.join(process.cwd(), 'public', 'tisch-mark.png')
    : path.join(__dirname, '..', 'dist', 'tisch-mark.png')
}

function getAppIcon() {
  return nativeImage.createFromPath(getWindowIconPath())
}

function ensureWorkspace() {
  workspaceStore.ensureWorkspace(getWorkspaceDir())
}

function getMimeType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.avif':
      return 'image/avif'
    case '.gif':
      return 'image/gif'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.svg':
      return 'image/svg+xml'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

function resolveWorkspaceAsset(requestUrl) {
  const url = new URL(requestUrl)
  if (url.hostname !== 'workspace') {
    return null
  }

  const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
  if (!relativePath) {
    return null
  }

  const workspaceDir = path.resolve(getWorkspaceDir())
  const assetPath = path.resolve(workspaceDir, relativePath)
  const relativeToWorkspace = path.relative(workspaceDir, assetPath)
  if (
    relativeToWorkspace.startsWith('..') ||
    path.isAbsolute(relativeToWorkspace)
  ) {
    return null
  }

  return assetPath
}

function registerWorkspaceAssetProtocol() {
  protocol.handle('tisch-asset', async (request) => {
    const assetPath = resolveWorkspaceAsset(request.url)
    if (!assetPath || !fs.existsSync(assetPath)) {
      return new Response('Not found', { status: 404 })
    }

    const body = fs.readFileSync(assetPath)
    return new Response(body, {
      headers: {
        'content-type': getMimeType(assetPath),
      },
    })
  })
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

function loadWorkspace() {
  return workspaceStore.loadWorkspace(getWorkspaceDir())
}

function saveWorkspace(data) {
  return workspaceStore.withWorkspaceLock(getWorkspaceDir(), () =>
    workspaceStore.saveWorkspace(getWorkspaceDir(), data),
  )
}

function importImage(sourcePath) {
  return workspaceStore.importImage(getWorkspaceDir(), sourcePath)
}

function notifyWorkspaceChanged() {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('planner:workspaceChanged')
  }
}

function scheduleWorkspaceChanged() {
  if (workspaceWatchTimer) {
    clearTimeout(workspaceWatchTimer)
  }

  workspaceWatchTimer = setTimeout(() => {
    workspaceWatchTimer = null
    notifyWorkspaceChanged()
  }, 120)
}

function watchWorkspace() {
  ensureWorkspace()

  if (workspaceWatcher) {
    workspaceWatcher.close()
  }

  try {
    workspaceWatcher = fs.watch(
      getWorkspaceDir(),
      { recursive: true },
      (_eventType, fileName) => {
        if (!fileName) {
          scheduleWorkspaceChanged()
          return
        }

        const normalized = String(fileName).replace(/\\/g, '/')
        if (
          normalized === 'planner.json' ||
          normalized.startsWith('pages/') ||
          normalized.startsWith('images/')
        ) {
          scheduleWorkspaceChanged()
        }
      },
    )
  } catch {
    workspaceWatcher = fs.watch(getWorkspaceDir(), (_eventType, fileName) => {
      if (!fileName || String(fileName) === 'planner.json') {
        scheduleWorkspaceChanged()
      }
    })
  }
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
    icon: getAppIcon(),
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
  registerWorkspaceAssetProtocol()
  watchWorkspace()

  if (process.platform === 'darwin') {
    app.dock.setIcon(getAppIcon())
  }

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
