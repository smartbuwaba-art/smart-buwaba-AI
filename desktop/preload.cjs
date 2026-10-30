const { contextBridge, ipcRenderer } = require("electron");

// Expose only named app-launch operations; never expose Node or shell APIs directly.
contextBridge.exposeInMainWorld("SmartBuwabaDesktop", Object.freeze({
  openApp: (appName) => ipcRenderer.invoke("smart-buwaba:open-app", String(appName || ""))
}));

\n// Only the packaged local floating bubble can request the assistant window.\ncontextBridge.exposeInMainWorld("ChatBuwabaDesktop", Object.freeze({\n  openAssistant: () => ipcRenderer.invoke("chat-buwaba:show-assistant")\n}));\n