@echo off
title IELTS Vocab DeepSeek - Windows Setup
cd /d "%~dp0"
set "APP_URL=http://localhost:3000"

echo.
echo ==========================================
echo  IELTS Vocab DeepSeek - Windows Setup
echo ==========================================
echo.
echo IMPORTANT:
echo 1. Revoke/delete any API key you shared publicly.
echo 2. Generate a new DeepSeek API key.
echo 3. Paste the NEW key here.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or not in PATH.
  echo Please install Node.js LTS first, then run this file again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is not installed or not in PATH.
  echo Please install Node.js LTS first, then run this file again.
  pause
  exit /b 1
)

set /p DSKEY=Paste NEW DeepSeek API Key and press Enter: 

if "%DSKEY%"=="" (
  echo No API key entered.
  pause
  exit /b 1
)

echo DEEPSEEK_API_KEY=%DSKEY%> .env.local
echo DEEPSEEK_MODEL=deepseek-v4-flash>> .env.local

echo.
echo Created .env.local
echo.
echo Installing dependencies. This may take a few minutes...
call npm.cmd install

if errorlevel 1 (
  echo.
  echo npm install failed.
  echo Try running this manually in this folder:
  echo npm install
  pause
  exit /b 1
)

set "PORT_PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":3000 .*LISTENING"') do (
  set "PORT_PID=%%P"
)

if defined PORT_PID (
  echo.
  echo Port 3000 is already in use by process %PORT_PID%.
  echo If the website is already open, choose O.
  echo If Chrome is stuck on an old server, choose R to restart port 3000.
  echo.
  choice /C OR /M "Open existing site (O) or restart port 3000 (R)?"
  if errorlevel 2 (
    if exist "%~dp0scripts\local-production-server.mjs" (
      node "%~dp0scripts\local-production-server.mjs" --stop
      if errorlevel 1 (
        echo Could not stop the existing local service safely.
        pause
        exit /b 1
      )
    ) else (
      taskkill /PID %PORT_PID% /F
    )
    timeout /t 2 >nul
  ) else (
    start "" "%APP_URL%"
    pause
    exit /b 0
  )
)

echo.
echo Starting website...
echo Open this in browser: %APP_URL%
start "" "%APP_URL%"
call npm.cmd run dev

pause
