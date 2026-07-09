@echo off
setlocal enabledelayedexpansion
title Fast Publish (No Audio) to Tencent CloudBase

set "PROJECT_DIR=%~dp0"
set "START_BAT=%PROJECT_DIR%start-windows.bat"
set "EXPORT_DIR=%PROJECT_DIR%.deploy\vocab-static-export"
set "ZIP_FILE=%TEMP%\static-site.zip"
set "ENV_ID=ielts-vocab-d1gymoilc5746f67a"
set "DEPLOY_PATH=/beidanci"

echo.
echo ========================================
echo Fast Publish IELTS Vocab (No Audio)
echo ========================================
echo.

where tcb >nul 2>nul
if errorlevel 1 (
  echo ERROR: tcb command was not found. Run setup-tcb.cmd first.
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
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri 'http://localhost:3000/api/export-cache' -UseBasicParsing -TimeoutSec 10 | Out-Null; exit 0 } catch { exit 1 }"

if errorlevel 1 (
  echo Publish cache is missing.
  echo Opening local page. Please wait until words appear.
  start "" "http://localhost:3000"
  timeout /t 10 /nobreak >nul

  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri 'http://localhost:3000/api/export-cache' -UseBasicParsing -TimeoutSec 10 | Out-Null; exit 0 } catch { exit 1 }"

  if errorlevel 1 (
    echo ERROR: Publish cache is still missing.
    echo Open http://localhost:3000, wait 3 seconds, then run this script again.
    pause
    exit /b 1
  )
)

echo Step 3: Export static-site.zip...
if exist "%ZIP_FILE%" del /f /q "%ZIP_FILE%" >nul 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri 'http://localhost:3000/api/export-static' -UseBasicParsing -TimeoutSec 900 -OutFile '%ZIP_FILE%'; exit 0 } catch { Write-Host $_; exit 1 }"

if errorlevel 1 (
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
  echo ERROR: index.html not found.
  pause
  exit /b 1
)

echo Step 5: Fast deploy without audio...
echo Uploading html/js/css/data only. Remote audio files stay unchanged.

call tcb hosting deploy "%EXPORT_DIR%\index.html" %DEPLOY_PATH%/index.html -e %ENV_ID%
if errorlevel 1 goto FAIL

if exist "%EXPORT_DIR%\spelling.html" (
  call tcb hosting deploy "%EXPORT_DIR%\spelling.html" %DEPLOY_PATH%/spelling.html -e %ENV_ID%
  if errorlevel 1 goto FAIL
)

call tcb hosting deploy "%EXPORT_DIR%\assets" %DEPLOY_PATH%/assets -e %ENV_ID%
if errorlevel 1 goto FAIL

call tcb hosting deploy "%EXPORT_DIR%\data" %DEPLOY_PATH%/data -e %ENV_ID%
if errorlevel 1 goto FAIL

if exist "%EXPORT_DIR%\sw.js" (
  call tcb hosting deploy "%EXPORT_DIR%\sw.js" %DEPLOY_PATH%/sw.js -e %ENV_ID%
  if errorlevel 1 goto FAIL
)

if exist "%EXPORT_DIR%\manifest.webmanifest" (
  call tcb hosting deploy "%EXPORT_DIR%\manifest.webmanifest" %DEPLOY_PATH%/manifest.webmanifest -e %ENV_ID%
  if errorlevel 1 goto FAIL
)

if exist "%EXPORT_DIR%\sync-config.js" (
  call tcb hosting deploy "%EXPORT_DIR%\sync-config.js" %DEPLOY_PATH%/sync-config.js -e %ENV_ID%
  if errorlevel 1 goto FAIL
)

if exist "%EXPORT_DIR%\README.txt" (
  call tcb hosting deploy "%EXPORT_DIR%\README.txt" %DEPLOY_PATH%/README.txt -e %ENV_ID%
  if errorlevel 1 goto FAIL
)

echo.
echo ========================================
echo Fast publish completed.
echo Audio was NOT uploaded this time.
echo ========================================
echo.
echo URL:
echo https://ielts-vocab-d1gymoilc5746f67a-1441466606.tcloudbaseapp.com/beidanci/?v=fast1
echo Spelling:
echo https://ielts-vocab-d1gymoilc5746f67a-1441466606.tcloudbaseapp.com/beidanci/spelling.html
echo.
pause
exit /b 0

:FAIL
echo.
echo ERROR: Fast deploy failed.
pause
exit /b 1