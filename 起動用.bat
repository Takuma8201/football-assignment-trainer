@echo off
setlocal

cd /d "%~dp0"
set "NODE_HOME=C:\Program Files\nodejs"
set "PATH=%NODE_HOME%;%PATH%"
set "DEV_HOST=0.0.0.0"
set "DEV_PORT=3000"

echo ========================================
echo Assignment Memorizer launcher
echo Folder: %CD%
echo ========================================
echo.

if exist "%NODE_HOME%\node.exe" (
  set "NODE_EXE=%NODE_HOME%\node.exe"
  set "NPM_CMD=%NODE_HOME%\npm.cmd"
) else (
  for %%I in (node.exe) do set "NODE_EXE=%%~$PATH:I"
  for %%I in (npm.cmd) do set "NPM_CMD=%%~$PATH:I"
)

if not exist "%NODE_EXE%" (
  echo ERROR: node was not found.
  echo Install Node.js 20+ and run this file again.
  goto END
)

if not exist "%NPM_CMD%" (
  echo ERROR: npm was not found.
  echo Check your Node.js installation and PATH.
  goto END
)

echo Node:
"%NODE_EXE%" -v
echo npm:
call "%NPM_CMD%" -v

if not exist "node_modules" (
  echo Installing dependencies...
  call "%NPM_CMD%" install
  if errorlevel 1 (
    echo.
    echo ERROR: npm install failed.
    goto END
  )
)

echo.
echo Starting dev server...
echo Open http://localhost:%DEV_PORT% on this PC after Next.js is ready.
echo Open http://192.168.3.8:%DEV_PORT% from other devices on the same network.
echo Press Ctrl+C to stop the server.
echo.

call "%NPM_CMD%" run dev -- --hostname=%DEV_HOST% --port=%DEV_PORT%
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
  echo Dev server exited with error code: %EXIT_CODE%
) else (
  echo Dev server stopped.
)

:END
echo.
echo This window will stay open.
echo Press any key to close.
pause >nul
exit /b
