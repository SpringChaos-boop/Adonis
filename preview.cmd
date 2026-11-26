@echo off
chcp 65001 >nul
title Горицвет — локальный просмотр
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel%==0 (
  echo Запускаю сервер на Node.js...
  start "Горицвет — сервер" node server.mjs 8080
  timeout /t 2 >nul
  start "" http://localhost:8080/
  exit /b
)

where python >nul 2>nul
if %errorlevel%==0 (
  echo Запускаю сервер на Python...
  start "Горицвет — сервер" python -m http.server 8080
  timeout /t 2 >nul
  start "" http://localhost:8080/
  exit /b
)

echo.
echo Не найден ни Node.js, ни Python.
echo Поставьте Node.js: https://nodejs.org/
echo Или откройте index.html напрямую: статическая версия работает и так,
echo но правки в content.json тогда не подхватятся.
echo.
pause
