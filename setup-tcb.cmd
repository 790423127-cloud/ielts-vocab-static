@echo off
setlocal
title Setup Tencent CloudBase CLI

echo.
echo ========================================
echo Setup Tencent CloudBase CLI
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found.
  echo Please install Node.js first, then run this file again.
  pause
  exit /b 1
)

echo Step 1: Node.js detected:
node -v

echo.
echo Step 2: Installing CloudBase CLI...
call npm install -g @cloudbase/cli

if errorlevel 1 (
  echo.
  echo ERROR: CloudBase CLI installation failed.
  pause
  exit /b 1
)

echo.
echo Step 3: Login to Tencent Cloud...
call tcb login

echo.
echo Done. Next time run publish-tencent.cmd.
pause
endlocal
