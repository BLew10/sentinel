#!/bin/bash
# Sentinel daily pipeline — invoked by macOS launchd
# Runs weekdays at 7:00 AM PST (10:00 AM ET, after market open)

export PATH="/Users/brandonlewis/.nvm/versions/node/v22.22.0/bin:$PATH"

cd /Users/brandonlewis/Documents/sentinel

LOG_DIR="$HOME/.sentinel/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/cron-$(date +%Y-%m-%d).log"

echo "=== Sentinel Cron: $(date) ===" >> "$LOG_FILE"
npx tsx scripts/run-cron.ts all >> "$LOG_FILE" 2>&1
echo "=== Finished: $(date) ===" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"
