@echo off
chcp 65001 >nul
title Mijia Geek AI - Dev Server

echo ========================================================
echo         Mijia Geek AI One-Click Start Script
echo ========================================================
echo.

cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% equ 0 goto start_service

if exist "C:\Program Files\Huawei\DevEco Studio\tools\node\node.exe" (
    set "PATH=C:\Program Files\Huawei\DevEco Studio\tools\node;%PATH%"
    goto start_service
)

if exist "C:\Program Files\nodejs\node.exe" (
    set "PATH=C:\Program Files\nodejs;%PATH%"
    goto start_service
)

if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
    set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
    goto start_service
)

echo [ERROR] Node.js not found in PATH or standard installation directories.
echo Please make sure Node.js is installed.
echo.
pause
exit /b 1

:start_service
echo Starting Next.js development server...
echo Access URL: http://localhost:3000
echo.

start "" cmd /c "timeout /t 3 >nul && start http://localhost:3000"

node ./node_modules/next/dist/bin/next dev

if %errorlevel% neq 0 (
    echo.
    echo Server stopped.
    pause
)