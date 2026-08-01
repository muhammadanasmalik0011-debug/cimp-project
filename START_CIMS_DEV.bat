@echo off
setlocal
cd /d "%~dp0"

echo Starting CIMS development servers...

if not exist "backend\node_modules" (
  pushd backend
  call npm install --no-audit --no-fund
  popd
)

if not exist "frontend\node_modules" (
  pushd frontend
  call npm install --no-audit --no-fund
  popd
)

start "CIMS API" cmd /k "cd /d ""%~dp0backend"" && npm run dev"
start "CIMS Frontend" cmd /k "cd /d ""%~dp0frontend"" && npm run dev"

echo API:      http://localhost:3005/api
echo Frontend: http://localhost:5173
echo.
pause
