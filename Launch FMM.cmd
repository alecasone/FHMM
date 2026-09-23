@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo FMM needs Node.js 20 or newer. Install the LTS release from https://nodejs.org/
  pause
  exit /b 1
)
if not exist "node_modules\three\package.json" (
  echo Installing FMM dependencies for the first launch...
  call npm.cmd ci --cache ".runtime\npm-cache" --no-audit --no-fund
  if errorlevel 1 (pause & exit /b 1)
)
if not exist "app\brushes\manifest.json" (
  call npm.cmd run prepare-brushes
  if errorlevel 1 (pause & exit /b 1)
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch.ps1"
if errorlevel 1 pause
