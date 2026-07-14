@echo off
title ChatSpace Pro Startup
color 0A
echo.
echo =========================================
echo    ChatSpace Pro - Starting...
echo =========================================
echo.
cd /d C:\Users\srava\OneDrive\Desktop\chatspace-pro
echo [1/3] Killing old ports...
call npx kill-port 5000
timeout /t 2 /nobreak >nul
echo [2/3] Starting backend server...
start "ChatSpace Server" cmd /k "cd /d C:\Users\srava\OneDrive\Desktop\chatspace-pro\server && node index.js"
timeout /t 4 /nobreak >nul
echo [3/3] Starting ngrok with fixed domain...
start "ngrok" cmd /k "ngrok http --url=resume-embezzle-overbill.ngrok-free.dev 5000"
timeout /t 4 /nobreak >nul
echo.
echo =========================================
echo    Server is running!
echo    Your fixed URL is:
echo    https://resume-embezzle-overbill.ngrok-free.dev
echo =========================================
echo.
echo Share this link with your friends!
echo.
pause