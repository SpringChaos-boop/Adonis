@echo off
chcp 65001 >nul
title Горицвет — проверка перед публикацией
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Для проверки нужен Node.js: https://nodejs.org/
  echo.
  pause
  exit /b
)

node check.mjs
echo.
pause
