@echo off

echo.
echo   ============================================
echo       TJMJ Mahjong - Stop All Services
echo   ============================================
echo.
echo   Shutting down...
echo.

:: Kill all node processes (frontend + server)
taskkill /f /im node.exe > nul 2>&1 && (
    echo   [OK] Node.js processes killed
) || (
    echo   [-] No Node.js process running
)

:: Kill ngrok
taskkill /f /im ngrok.exe > nul 2>&1 && (
    echo   [OK] ngrok process killed
) || (
    echo   [-] No ngrok process running
)

echo.
echo   All services stopped.
echo.
pause
