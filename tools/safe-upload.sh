#!/bin/bash
# safe-upload.sh — Validate + Upload to Supabase
# يمنع رفع أي ملف فيه مسارات داخلية أو بصمات نظام
# Usage: safe-upload.sh <local-file> <supabase-path>

set -e

LOCAL_FILE="$1"
SUPABASE_PATH="$2"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

if [ -z "$LOCAL_FILE" ] || [ -z "$SUPABASE_PATH" ]; then
  echo -e "${RED}Usage: safe-upload.sh <local-file> <supabase-path>${NC}"
  echo "Example: safe-upload.sh ./video-08.md projects/injazat/Etmam/video-scripts/video-08.md"
  exit 1
fi

if [ ! -f "$LOCAL_FILE" ]; then
  echo -e "${RED}❌ File not found: $LOCAL_FILE${NC}"
  exit 1
fi

# === VALIDATION: Blocked patterns ===
BLOCKED_PATTERNS=(
  '/home/node'
  '/home/openclaw'
  'openclaw'
  'PyraAI'
  'بايرا'
  'bayra'
  'sub-agent'
  'supabase'
  'pyraai'
  'GUIDELINES\.md'
  '\.mjs'
  'api_key'
  'Bearer '
  'WORKSPACE_DB'
  'SERVICE_KEY'
  'credentials/'
  'node_modules'
  '\.openclaw'
  'anthropic'
  'claude'
  'openai'
  'sessions_spawn'
  'memory_search'
)

FOUND_ISSUES=0
echo "🔍 Scanning: $LOCAL_FILE"
echo "---"

for pattern in "${BLOCKED_PATTERNS[@]}"; do
  MATCHES=$(grep -in "$pattern" "$LOCAL_FILE" 2>/dev/null || true)
  if [ -n "$MATCHES" ]; then
    echo -e "${RED}❌ BLOCKED: '$pattern' found:${NC}"
    echo "$MATCHES" | head -3
    FOUND_ISSUES=$((FOUND_ISSUES + 1))
  fi
done

if [ $FOUND_ISSUES -gt 0 ]; then
  echo ""
  echo -e "${RED}🚫 UPLOAD BLOCKED — $FOUND_ISSUES issue(s) found.${NC}"
  echo -e "${RED}Fix the file first, then try again.${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Clean — no internal references found.${NC}"
echo ""

# === UPLOAD ===
export $(grep WORKSPACE_DB_SERVICE_KEY /home/node/.openclaw/credentials/pyra-voice.env 2>/dev/null | xargs)

if [ -z "$WORKSPACE_DB_SERVICE_KEY" ]; then
  echo -e "${RED}❌ WORKSPACE_DB_SERVICE_KEY not found${NC}"
  exit 1
fi

echo "📤 Uploading to: $SUPABASE_PATH"
RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT \
  "https://pyraworkspacedb.pyramedia.cloud/storage/v1/object/pyraai-workspace/$SUPABASE_PATH" \
  -H "Authorization: Bearer $WORKSPACE_DB_SERVICE_KEY" \
  -H "Content-Type: text/markdown" \
  -H "x-upsert: true" \
  --data-binary @"$LOCAL_FILE")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Uploaded successfully${NC}"
else
  echo -e "${RED}❌ Upload failed (HTTP $HTTP_CODE): $BODY${NC}"
  exit 1
fi
