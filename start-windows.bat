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

set "NEED_BUILD=0"
if not exist ".next\BUILD_ID" set "NEED_BUILD=1"
if exist ".next\BUILD_ID" (
  for /f %%B in ('powershell.exe -NoProfile -Command "$build=(Get-Item '.next\BUILD_ID').LastWriteTimeUtc; $paths=@('app','public','package.json','next.config.mjs','middleware.js'); $newer=Get-ChildItem -LiteralPath $paths -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTimeUtc -gt $build } | Select-Object -First 1; if($newer){'1'}else{'0'}"') do set "NEED_BUILD=%%B"
)

set "PORT_PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":3000 .*LISTENING"') do (
  set "PORT_PID=%%P"
)

if defined PORT_PID (
  if "%NEED_BUILD%"=="1" (
    goto restart_existing
  ) else (
    if not exist ".next\.running-build-id" goto restart_existing
    fc /b ".next\BUILD_ID" ".next\.running-build-id" >nul 2>nul
    if errorlevel 1 goto restart_existing
    start "" %APP_URL%
    exit /b 0
  )
)

goto prepare_build

:restart_existing
echo Website files or the production build changed. Restarting the local server automatically...
taskkill /PID %PORT_PID% /F >nul 2>nul
powershell.exe -NoProfile -Command "Start-Sleep -Seconds 1"

:prepare_build
if "%NEED_BUILD%"=="1" (
  echo.
  echo Website files changed. Building the fast production version...
  call npm.cmd run build
  if errorlevel 1 (
    echo.
    echo Build failed. The website was not started with an incomplete version.
    pause
    exit /b 1
  )
)

echo.
echo Starting fast production website...
echo Open this in browser: %APP_URL%
copy /y ".next\BUILD_ID" ".next\.running-build-id" >nul
start "" %APP_URL%
call npm.cmd start
del /q ".next\.running-build-id" >nul 2>nul
pause
