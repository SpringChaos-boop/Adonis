@echo off
chcp 65001 >nul
title Горицвет — сборка страниц
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Для сборки нужен Node.js: https://nodejs.org/
  echo Статическая версия сайта (index.html) работает и без сборки.
  echo.
  pause
  exit /b
)

node build.mjs
echo.
pause
