@echo off
chcp 65001 >nul
title Goritsvet - build
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto nonode

node build.mjs
goto done

:nonode
echo.
echo Node.js is required for the build: https://nodejs.org/
echo The static site works without it, but index.html stays as last built.
echo.

:done
echo.
pause