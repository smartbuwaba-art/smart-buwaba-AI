# Smart Buwaba AI — Windows Companion

This desktop companion loads the Smart Buwaba AI web app and adds an allowlisted bridge for Windows actions.

## Voice commands supported

Try saying:

- "Open YouTube" or "pita ku YouTube"
- "Go to music" / "pita ku music"
- "Open WhatsApp" / "tsegula WhatsApp"
- "Open Calculator"
- "Open Notepad"
- "Open File Explorer"
- "Open Task Manager"
- "Open Paint"
- "Open Settings"
- "Open Camera"

Website destinations open through the default browser. Native Windows commands are restricted to the fixed list in `main.cjs`; the AI cannot pass arbitrary shell commands or arguments.

## Build on Windows

From this directory:

```powershell
npm install
npm run dist:win
```

The portable `.exe` is written to `dist/`. A GitHub Actions workflow also builds it on a Windows runner.

## Security

The app loads only the HTTPS Smart Buwaba origin, keeps Node.js disabled in the renderer, exposes one restricted preload API, validates the sender origin for IPC, restricts microphone permission to the Smart Buwaba origin, and uses a fixed list of actions. Desktop app launch is available only in this companion, not in a normal browser tab.
