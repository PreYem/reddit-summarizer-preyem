@echo off
echo Setting up Reddit Summarizer...

echo [1/3] Installing dependencies for both workspaces...
call npm install

if not exist express-backend\.env (
    echo [2/3] Creating express-backend\.env from .env.example...
    copy express-backend\.env.example express-backend\.env
) else (
    echo [2/3] express-backend\.env already exists, skipping.
)

echo [3/3] Building the extension for both browsers...
pushd extension
call npm run build
popd

echo Setup complete. Fill in your API keys in express-backend\.env, then run windows_start_dev_server.bat.
pause