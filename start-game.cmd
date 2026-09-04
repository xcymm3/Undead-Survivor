@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.12 or newer is required. Install it and try again.
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Starting Undead Survivor. Close this window to stop the server.
call npm run dev -- --strictPort --open
if errorlevel 1 pause
