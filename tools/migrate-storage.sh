#!/bin/bash
set -euo pipefail

# Load credentials
export $(grep -v '^#' /home/node/.openclaw/credentials/pyra-voice.env | xargs)

OLD_URL="https://db.pyramedia.info"
NEW_URL="https://pyraworkspacedb.pyramedia.cloud"
OLD_KEY="$SUPABASE_SERVICE_KEY"
NEW_KEY="$WORKSPACE_DB_SERVICE_KEY"
BUCKET="pyraai-workspace"
REPORT="/home/node/openclaw/workspace-analysis/storage-migration-report.md"
TOTAL_FILES=0
TOTAL_BYTES=0
FAILED_FILES=""
FAILED_COUNT=0

# Content-Type mapping
get_content_type() {
  local f="$1"
  case "${f##*.}" in
    md) echo "text/markdown";;
    png) echo "image/png";;
    jpg|jpeg) echo "image/jpeg";;
    pdf) echo "application/pdf";;
    json) echo "application/json";;
    docx) echo "application/vnd.openxmlformats-officedocument.wordprocessingml.document";;
    html) echo "text/html";;
    sql|txt) echo "text/plain";;
    mp3) echo "audio/mpeg";;
    opus) echo "audio/opus";;
    webp) echo "image/webp";;
    gif) echo "image/gif";;
    csv) echo "text/csv";;
    *) echo "application/octet-stream";;
  esac
}

echo "=== Step 1: Create bucket on new DB ==="
RESULT=$(curl -s -w "\n%{http_code}" -X POST "$NEW_URL/storage/v1/bucket" \
  -H "apikey: $NEW_KEY" \
  -H "Authorization: Bearer $NEW_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"pyraai-workspace","name":"pyraai-workspace","public":true,"file_size_limit":524288000}')
HTTP_CODE=$(echo "$RESULT" | tail -1)
BODY=$(echo "$RESULT" | head -n -1)
echo "Bucket creation: HTTP $HTTP_CODE — $BODY"

echo ""
echo "=== Step 2: List and migrate files ==="

# Folders to scan
FOLDERS=(
  ""
  "bayra"
  "content"
  "content/dubai-documentary"
  "projects/legal-research"
  "projects/legal-research/scripts"
  "projects/legal-research/reviews"
  "projects/meta-ads"
  "projects/pyrastore-bot"
  "projects/ramadan-series"
  "projects/ramadan-series/scripts"
  "projects/ramadan-series/characters"
  "projects/workspace-analysis"
  "shared"
  "temp"
)

migrate_file() {
  local filepath="$1"
  local ct=$(get_content_type "$filepath")
  
  # Download
  curl -sf -o /tmp/migrate_tmp "$OLD_URL/storage/v1/object/$BUCKET/$filepath" \
    -H "apikey: $OLD_KEY" \
    -H "Authorization: Bearer $OLD_KEY"
  
  if [ ! -f /tmp/migrate_tmp ]; then
    echo "  ❌ DOWNLOAD FAILED: $filepath"
    return 1
  fi
  
  local size=$(stat -c%s /tmp/migrate_tmp 2>/dev/null || echo 0)
  
  # Upload
  local resp=$(curl -s -w "\n%{http_code}" -X POST "$NEW_URL/storage/v1/object/$BUCKET/$filepath" \
    -H "apikey: $NEW_KEY" \
    -H "Authorization: Bearer $NEW_KEY" \
    -H "Content-Type: $ct" \
    --data-binary @/tmp/migrate_tmp)
  
  local up_code=$(echo "$resp" | tail -1)
  local up_body=$(echo "$resp" | head -n -1)
  
  rm -f /tmp/migrate_tmp
  
  if [ "$up_code" = "200" ]; then
    echo "  ✅ $filepath ($size bytes, $ct)"
    return 0
  else
    # Try upsert if duplicate
    if echo "$up_body" | grep -q "Duplicate"; then
      echo "  ⏭️  $filepath (already exists)"
      return 0
    fi
    echo "  ❌ UPLOAD FAILED ($up_code): $filepath — $up_body"
    return 1
  fi
}

for folder in "${FOLDERS[@]}"; do
  echo ""
  echo "--- Folder: ${folder:-/root} ---"
  
  # List files in folder
  FILES_JSON=$(curl -s -X POST "$OLD_URL/storage/v1/object/list/$BUCKET" \
    -H "apikey: $OLD_KEY" \
    -H "Authorization: Bearer $OLD_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"prefix\":\"$folder\",\"limit\":500}")
  
  # Extract file names (skip folders — they have null id)
  FILENAMES=$(echo "$FILES_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for item in data:
    if item.get('id') is not None:
        print(item['name'])
" 2>/dev/null || true)
  
  if [ -z "$FILENAMES" ]; then
    echo "  (no files)"
    continue
  fi
  
  while IFS= read -r fname; do
    if [ -n "$folder" ]; then
      filepath="$folder/$fname"
    else
      filepath="$fname"
    fi
    
    if migrate_file "$filepath"; then
      TOTAL_FILES=$((TOTAL_FILES + 1))
      fsize=$(stat -c%s /tmp/migrate_tmp 2>/dev/null || echo 0)
    else
      FAILED_COUNT=$((FAILED_COUNT + 1))
      FAILED_FILES="$FAILED_FILES\n- $filepath"
    fi
  done <<< "$FILENAMES"
done

echo ""
echo "=== Step 3: Verify counts on new DB ==="
VERIFY_REPORT=""
for folder in "${FOLDERS[@]}"; do
  COUNT=$(curl -s -X POST "$NEW_URL/storage/v1/object/list/$BUCKET" \
    -H "apikey: $NEW_KEY" \
    -H "Authorization: Bearer $NEW_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"prefix\":\"$folder\",\"limit\":500}" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(len([x for x in data if x.get('id') is not None]))
" 2>/dev/null || echo "?")
  
  label="${folder:-root}"
  VERIFY_REPORT="$VERIFY_REPORT| $label | $COUNT |\n"
  echo "  $label: $COUNT files"
done

echo ""
echo "=== Writing report ==="
mkdir -p /home/node/openclaw/workspace-analysis

cat > "$REPORT" << ENDREPORT
# Storage Migration Report

**Date:** $(date -u '+%Y-%m-%d %H:%M UTC')
**Source:** $OLD_URL (bucket: $BUCKET)
**Destination:** $NEW_URL (bucket: $BUCKET)

## Summary

- **Total files migrated:** $TOTAL_FILES
- **Failed:** $FAILED_COUNT
- **Status:** $([ $FAILED_COUNT -eq 0 ] && echo "✅ Complete" || echo "⚠️ Partial — see errors below")

## Verification (New DB file counts)

| Folder | Count |
|--------|-------|
$(echo -e "$VERIFY_REPORT")

## Errors
$([ $FAILED_COUNT -eq 0 ] && echo "None" || echo -e "$FAILED_FILES")
ENDREPORT

echo "✅ Report written to $REPORT"
echo "Total migrated: $TOTAL_FILES | Failed: $FAILED_COUNT"
