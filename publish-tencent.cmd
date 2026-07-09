@echo off
setlocal enabledelayedexpansion
title One Click Publish to Tencent CloudBase

set "PROJECT_DIR=%~dp0"
set "START_BAT=%PROJECT_DIR%start-windows.bat"
set "EXPORT_DIR=%PROJECT_DIR%.deploy\vocab-static-export"
set "ZIP_FILE=%TEMP%\static-site.zip"
set "ENV_ID=ielts-vocab-d1gymoilc5746f67a"
set "DEPLOY_PATH=/beidanci"

echo.
echo ========================================
echo One Click Publish to Tencent CloudBase
echo ========================================
echo.

where tcb >nul 2>nul
if errorlevel 1 (
  echo ERROR: tcb command was not found.
  echo Please run setup-tcb.cmd first.
  pause
  exit /b 1
)

echo Step 1: Check local site...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri 'http://localhost:3000' -UseBasicParsing -TimeoutSec 5 | Out-Null; exit 0 } catch { exit 1 }"

if errorlevel 1 (
  echo Local site is not running. Trying to start it...
  if exist "%START_BAT%" (
    start "IELTS Vocab Local Site" "%START_BAT%"
  ) else (
    echo ERROR: start-windows.bat was not found:
    echo %START_BAT%
    pause
    exit /b 1
  )

  echo Waiting for local site...
  set READY=0
  for /L %%i in (1,1,40) do (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri 'http://localhost:3000' -UseBasicParsing -TimeoutSec 3 | Out-Null; exit 0 } catch { exit 1 }"
    if not errorlevel 1 (
      set READY=1
      goto SITE_READY
    )
    timeout /t 3 /nobreak >nul
  )

  :SITE_READY
  if "!READY!"=="0" (
    echo ERROR: Local site did not start in time.
    pause
    exit /b 1
  )
)

echo Step 2: Check publish cache...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -Uri 'http://localhost:3000/api/export-cache' -UseBasicParsing -TimeoutSec 10; exit 0 } catch { exit 1 }"

if errorlevel 1 (
  echo Publish cache is missing.
  echo Opening local page once to let the browser save words into server cache...
  start "" "http://localhost:3000"
  echo Please wait 8 seconds...
  timeout /t 8 /nobreak >nul

  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -Uri 'http://localhost:3000/api/export-cache' -UseBasicParsing -TimeoutSec 10; exit 0 } catch { exit 1 }"

  if errorlevel 1 (
    echo.
    echo ERROR: Publish cache is still missing.
    echo Please do this once:
    echo 1. Open http://localhost:3000
    echo 2. Wait until your words appear
    echo 3. Wait 3 seconds
    echo 4. Run this script again
    echo.
    pause
    exit /b 1
  )
)

echo Step 3: Export static-site.zip...
if exist "%ZIP_FILE%" del /f /q "%ZIP_FILE%" >nul 2>nul

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri 'http://localhost:3000/api/export-static' -UseBasicParsing -TimeoutSec 900 -OutFile '%ZIP_FILE%'; exit 0 } catch { Write-Host $_; exit 1 }"

if errorlevel 1 (
  echo.
  echo ERROR: Export failed.
  pause
  exit /b 1
)

if not exist "%ZIP_FILE%" (
  echo ERROR: static-site.zip was not created.
  pause
  exit /b 1
)

echo Step 4: Extract export...
if exist "%EXPORT_DIR%" rmdir /s /q "%EXPORT_DIR%"
mkdir "%EXPORT_DIR%"

powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Force '%ZIP_FILE%' '%EXPORT_DIR%'"

if errorlevel 1 (
  echo ERROR: Extract failed.
  pause
  exit /b 1
)

if not exist "%EXPORT_DIR%\index.html" (
  echo ERROR: index.html not found in export folder.
  pause
  exit /b 1
)

echo Step 5: Deploy to Tencent CloudBase...
call tcb hosting deploy "%EXPORT_DIR%" %DEPLOY_PATH% -e %ENV_ID%

if errorlevel 1 (
  echo.
  echo ERROR: Tencent CloudBase deploy failed.
  pause
  exit /b 1
)

echo.
echo ========================================
echo Publish completed.
echo ========================================
echo.
echo URL:
echo https://ielts-vocab-d1gymoilc5746f67a-1441466606.tcloudbaseapp.com/beidanci/
echo.
pause
endlocal
