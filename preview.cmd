@echo off
chcp 65001 >nul
title Goritsvet - local preview
cd /d "%~dp0"

where node >nul 2>nul
if not errorlevel 1 goto node

where python >nul 2>nul
if not errorlevel 1 goto python

echo.
echo Neither Node.js nor Python was found.
echo Install Node.js: https://nodejs.org/
echo Or open index.html directly - the static version works,
echo but edits in content.json will not be applied.
echo.
pause
exit /b

:node
start "Goritsvet server" node server.mjs 8080
timeout /t 2 >nul
start "" http://localhost:8080/
exit /b

:python
start "Goritsvet server" python -m http.server 8080
timeout /t 2 >nul
start "" http://localhost:8080/
exit /b