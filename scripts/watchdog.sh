#!/usr/bin/env bash
# scripts/watchdog.sh - Automatic Auto-Healing Watchdog for DaFung Hub on cPanel
# Checks HTTP availability on local port 3088 and automatically revives PM2 if stopped/crashed.

# Ensure Node/PM2 paths are accessible in cron environment
export PATH="/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin:$HOME/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -n 1)/bin:$PATH"

# Move to project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT" || exit 1

PORT=3088
if [ -f .env ]; then
  ENV_PORT=$(grep -E "^PORT=" .env | cut -d '=' -f2 | tr -d ' "\r\n')
  if [ -n "$ENV_PORT" ]; then
    PORT="$ENV_PORT"
  fi
fi

LOG_FILE="$PROJECT_ROOT/watchdog.log"
TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")

# Check if application HTTP endpoint is responding with 200 OK
HTTP_STATUS=$(curl -s -m 5 -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/bot-status" 2>/dev/null)

if [ "$HTTP_STATUS" = "200" ]; then
  # Application is healthy and responding
  exit 0
fi

# Application is down or returning error
echo "[$TIMESTAMP] ALERT: DaFung Hub port $PORT returned HTTP $HTTP_STATUS or connection refused. Auto-healing triggered..." >> "$LOG_FILE"

# Revive PM2 daemon and application process
if command -v pm2 >/dev/null 2>&1; then
  # Try resurrecting from saved list first, fallback to restart or fresh start
  pm2 describe dafung-hub >/dev/null 2>&1
  if [ $? -eq 0 ]; then
    pm2 restart dafung-hub --update-env >> "$LOG_FILE" 2>&1
  else
    pm2 resurrect >> "$LOG_FILE" 2>&1 || pm2 start ecosystem.config.cjs --update-env >> "$LOG_FILE" 2>&1
  fi
  pm2 save >> "$LOG_FILE" 2>&1
  echo "[$TIMESTAMP] SUCCESS: Auto-heal completed via PM2." >> "$LOG_FILE"
elif command -v npx >/dev/null 2>&1; then
  npx pm2 restart dafung-hub || npx pm2 start ecosystem.config.cjs >> "$LOG_FILE" 2>&1
  echo "[$TIMESTAMP] SUCCESS: Auto-heal completed via npx pm2." >> "$LOG_FILE"
else
  echo "[$TIMESTAMP] ERROR: Neither pm2 nor npx command found in PATH." >> "$LOG_FILE"
  exit 1
fi

# Keep watchdog log file trimmed to maximum 500 lines
if [ -f "$LOG_FILE" ]; then
  tail -n 500 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
fi
