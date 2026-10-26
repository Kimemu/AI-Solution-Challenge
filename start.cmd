@echo off
setlocal
cd /d "%~dp0"
set "HOST=0.0.0.0"
set "PORT=37214"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS, then run this file again.
  pause
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 (
  echo Node.js 22.13 or newer is required. Node.js 24 LTS is recommended.
  pause
  exit /b 1
)
node server/setup-crawler.js
if errorlevel 1 (
  echo Python article crawler setup failed. Run setup-crawler.cmd to check.
  pause
  exit /b 1
)
node server.js --open
pause
