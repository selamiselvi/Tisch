const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('planner', {
  getWorkspacePath: () => ipcRenderer.invoke('planner:getWorkspacePath'),
  loadWorkspace: () => ipcRenderer.invoke('planner:loadWorkspace'),
  saveWorkspace: (data) => ipcRenderer.invoke('planner:saveWorkspace', data),
  pickImage: () => ipcRenderer.invoke('planner:pickImage'),
})
