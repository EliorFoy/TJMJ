@echo off
setlocal enabledelayedexpansion

:: =============================================
::   TJMJ Mahjong - Start All Services
:: =============================================

set "ROOT=%~dp0"

echo.
echo   ============================================
echo       TJMJ Mahjong - Start All Services
echo   ============================================
echo.
echo   Opening 3 terminal windows:
echo.
echo     [1] Game Server   WebSocket :8080
echo     [2] Frontend      Vite :5173
echo     [3] ngrok Tunnel  (forward 8080, optional)
echo.
echo   Order: Server -^> Frontend -^> ngrok
echo.

:: =============================================
:: Check dependencies
:: =============================================
echo   [Check] Installing dependencies...

if not exist "%ROOT%server\node_modules" (
    echo   [!] Server deps missing, installing...
    cd /d "%ROOT%server"
    call npm install
    cd /d "%ROOT%"
) else (
    echo   [OK] Server deps ready
)

if not exist "%ROOT%frontend\node_modules" (
    echo   [!] Frontend deps missing, installing...
    cd /d "%ROOT%frontend"
    call npm install
    cd /d "%ROOT%"
) else (
    echo   [OK] Frontend deps ready
)

:: Check ngrok (PATH first, then local other/ folder)
set "NGROK_OK=0"
set "NGROK_CMD=ngrok"
where ngrok > nul 2>&1
if %errorlevel% equ 0 (
    set "NGROK_OK=1"
    echo   [OK] ngrok found in PATH
) else if exist "%ROOT%other\ngrok.exe" (
    set "NGROK_OK=1"
    set "NGROK_CMD=%ROOT%other\ngrok.exe"
    echo   [OK] ngrok found in other\ngrok.exe
) else (
    echo   [!] ngrok not found - skipping public tunnel
)

echo.
echo   --------------------------------------------
echo   Press any key to start all services...
echo   --------------------------------------------
pause > nul

:: =============================================
:: 1. Game Server (start first)
:: =============================================
set "AGORA_APP_CERT=d9245838ca4a42a18e1a9e1517c05974"
start "TJMJ-GameServer" cmd /k "cd /d "%ROOT%server" && set AGORA_APP_CERT=%AGORA_APP_CERT% && echo. && echo ============================================ && echo   TJMJ Game Server WebSocket:8080 && echo. && echo   Agora Token: ENABLED && echo ============================================ && echo. && npm run dev"

:: Wait for server to boot
echo   Waiting for game server (3s)...
timeout /t 3 /nobreak > nul

:: =============================================
:: 2. Frontend
:: =============================================
start "TJMJ-Frontend" cmd /k "cd /d "%ROOT%frontend" && echo. && echo ============================================ && echo   TJMJ Frontend Vite :5173 && echo ============================================ && echo. && npm run dev"

:: =============================================
:: 3. ngrok (if available)
:: =============================================
if !NGROK_OK! equ 1 (
    start "TJMJ-ngrok" cmd /k "echo. && echo ============================================ && echo   ngrok Tunnel forwarding :8080 && echo ============================================ && echo. && !NGROK_CMD! http 8080"
)

echo.
echo   ============================================
echo       All services started!
echo   ============================================
echo.
echo     Local URL:  http://localhost:5173
echo     Game Server: ws://localhost:8080
if !NGROK_OK! equ 1 (
    echo     ngrok running - check its window for public URL
)
echo.
echo     Close each window to stop its service
echo   ============================================
echo.
pause
