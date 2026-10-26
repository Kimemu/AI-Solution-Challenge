@echo off
setlocal
cd /d "%~dp0"
node server/setup-crawler.js
if errorlevel 1 pause
