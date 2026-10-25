#!/usr/bin/env bash
set -e

echo "Setting up Reddit Summarizer..."

echo "[1/3] Installing dependencies for both workspaces..."
npm install

if [ ! -f express-backend/.env ]; then
    echo "[2/3] Creating express-backend/.env from .env.example..."
    cp express-backend/.env.example express-backend/.env
else
    echo "[2/3] express-backend/.env already exists, skipping."
fi

echo "[3/3] Building the extension for both browsers..."
(
    cd extension
    npm run build
)

echo "Setup complete. Fill in your API keys in express-backend/.env, then run linux_start_dev_server.sh."
