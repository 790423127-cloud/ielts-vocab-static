@echo off
title IELTS Vocab DeepSeek - Start
cd /d "%~dp0"
set "APP_URL=http://localhost:3000"

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is not installed. Please install Node.js LTS first.
  pause
  exit /b 1
)

if not exist node_modules\.bin\next.cmd (
  echo Dependencies are missing. Installing now...
  call npm.cmd install
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
    taskkill /PID %PORT_PID% /F
    timeout /t 2 >nul
  ) else (
    start "" %APP_URL%
    pause
    exit /b 0
  )
)

echo.
echo Starting website...
echo Open this in browser: %APP_URL%
start "" %APP_URL%
call npm.cmd run dev
pause
