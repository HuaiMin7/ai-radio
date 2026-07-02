const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("redioDesktop", {
  isDesktop: true,
  openQQMusicLogin: () => ipcRenderer.invoke("qq-music-open-login"),
  clearQQMusicLogin: () => ipcRenderer.invoke("qq-music-clear-login")
});
