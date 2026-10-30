# Chat Buwaba — Windows Floating Assistant

The Windows companion adds a small draggable Chat Buwaba **B** button that stays above other applications. Click it to open Chat Buwaba. The tray menu can show or hide the button or quit the app.

## Build on Windows

```powershell
npm install
npm run dist:win
```

The portable Windows executable is written to `dist/`. GitHub Actions builds it automatically when files in this folder change.

Voice mode is user-started from Chat Buwaba. This floating shortcut does not listen to the microphone in the background.
