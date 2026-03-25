#!/bin/bash
# stale-lock-cleaner.sh — Automatically removes stale session lock files
# A lock is "stale" if it's older than 2 minutes (no normal operation takes that long)
# Also cleans sessions older than 3 days to prevent disk bloat

AGENTS_BASE="/home/node/.openclaw/agents"
LOCK_MAX_AGE_MIN=2
SESSION_MAX_AGE_DAYS=3

CLEANED_LOCKS=0
CLEANED_SESSIONS=0

# 1. Remove stale lock files (older than 2 minutes) — ALL agents
for SESSIONS_DIR in "$AGENTS_BASE"/*/sessions; do
    [ -d "$SESSIONS_DIR" ] || continue
    for lockfile in "$SESSIONS_DIR"/*.lock; do
        [ -f "$lockfile" ] || continue
        
        lock_age=$(( $(date +%s) - $(stat -c %Y "$lockfile" 2>/dev/null || echo 0) ))
        
        if [ "$lock_age" -gt $(( LOCK_MAX_AGE_MIN * 60 )) ]; then
            lock_pid=$(grep -o '"pid":[0-9]*' "$lockfile" 2>/dev/null | grep -o '[0-9]*')
            
            if [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null; then
                echo "WARN: Removing stale lock held by running PID $lock_pid: $lockfile (age: ${lock_age}s)"
            else
                echo "INFO: Removing stale lock (dead PID $lock_pid): $lockfile (age: ${lock_age}s)"
            fi
            
            rm -f "$lockfile"
            CLEANED_LOCKS=$((CLEANED_LOCKS + 1))
        fi
    done
done

# 2. Remove old session files (older than N days, skip locked ones) — ALL agents
for SESSIONS_DIR in "$AGENTS_BASE"/*/sessions; do
    [ -d "$SESSIONS_DIR" ] || continue
    for session in $(find "$SESSIONS_DIR" -name "*.jsonl" -mtime +$SESSION_MAX_AGE_DAYS 2>/dev/null); do
        [ -f "${session}.lock" ] && continue
        rm -f "$session"
        CLEANED_SESSIONS=$((CLEANED_SESSIONS + 1))
    done
done

# Output summary
if [ "$CLEANED_LOCKS" -gt 0 ] || [ "$CLEANED_SESSIONS" -gt 0 ]; then
    echo "REPAIR_OK: Fixed $CLEANED_LOCKS stale locks, cleaned $CLEANED_SESSIONS old sessions"
else
    echo "OK: No stale locks or old sessions found"
fi
