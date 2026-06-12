@echo off
title ChatSpace Pro Startup
color 0A
echo.
echo =========================================
echo    ChatSpace Pro - Starting...
echo =========================================
echo.

cd /d C:\Users\laksh\OneDrive\Desktop\chatspace-pro

echo [1/4] Killing old ports...
call npx kill-port 5000
timeout /t 2 /nobreak >nul

echo [2/4] Starting backend server...
start "ChatSpace Server" cmd /k "cd /d C:\Users\laksh\OneDrive\Desktop\chatspace-pro\server && node index.js"
timeout /t 4 /nobreak >nul

echo [3/4] Starting ngrok...
start "ngrok" cmd /k "ngrok http 5000"
timeout /t 6 /nobreak >nul

echo [4/4] Getting your public URL...
timeout /t 3 /nobreak >nul

for /f "tokens=*" %%a in ('curl -s http://localhost:4040/api/tunnels ^| findstr /o "public_url" ^| findstr "ngrok-free"') do (
    set "raw=%%a"
)

echo.
echo =========================================
echo    Server is running!
echo    Check the ngrok window for your URL
echo    It looks like:
echo    https://xxxx.ngrok-free.app
echo =========================================
echo.
echo Copy that URL and share with your friends!
echo.
pause
