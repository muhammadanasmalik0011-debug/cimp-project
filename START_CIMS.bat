@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo   CIMS 2.0 - Mapbox Professional Dashboard
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or is not available in PATH.
  echo Install Node.js 20.19 or newer (Node.js 22 LTS recommended), then run this file again.
  pause
  exit /b 1
)

findstr /C:"DB_PASSWORD=YOUR_POSTGRES_PASSWORD" backend\.env >nul 2>nul
if not errorlevel 1 (
  echo [ACTION REQUIRED] backend\.env still contains the placeholder password.
  echo Copy the working database values from your existing CIMS backend\.env.
  echo.
  pause
  exit /b 1
)

if not exist "backend\node_modules" (
  echo [1/4] Installing backend packages...
  pushd backend
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :fail
  popd
) else (
  echo [1/4] Backend packages already installed.
)

if not exist "frontend\node_modules" (
  echo [2/4] Installing frontend packages...
  pushd frontend
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :fail
  popd
) else (
  echo [2/4] Frontend packages already installed.
)

echo [3/4] Building React + Mapbox frontend...
pushd frontend
call npm run build
if errorlevel 1 goto :fail
popd

echo [4/4] Starting CIMS on http://localhost:3005
echo Press Ctrl+C to stop the server.
echo.
pushd backend
call npm start
popd
exit /b 0

:fail
echo.
echo [ERROR] CIMS setup or build failed. Read the terminal error above.
popd
pause
exit /b 1
