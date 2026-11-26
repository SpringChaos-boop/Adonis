@echo off
chcp 65001 >nul
title Goritsvet - check
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto nonode

node check.mjs
goto done

:nonode
echo.
echo Node.js is required for the checks: https://nodejs.org/
echo.

:done
echo.
pause