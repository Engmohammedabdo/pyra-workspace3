#!/bin/bash
# Pyra Workspace Migration Script
# Exports schema + data from old DB, generates SQL, imports to new DB

set -e
export $(grep -v '^#' /home/node/.openclaw/credentials/pyra-voice.env | xargs)

OLD_URL="https://db.pyramedia.info"
NEW_URL="https://pyraworkspacedb.pyramedia.cloud"
OLD_KEY="$SUPABASE_SERVICE_KEY"
NEW_KEY="$WORKSPACE_DB_SERVICE_KEY"
OUT_DIR="/home/node/openclaw/workspace-analysis"

TABLES=(
  pyra_users
  pyra_sessions
  pyra_login_attempts
  pyra_blocked_logs
  pyra_settings
  pyra_teams
  pyra_team_members
  pyra_file_index
  pyra_file_versions
  pyra_file_permissions
  pyra_favorites
  pyra_reviews
  pyra_notifications
  pyra_activity_log
  pyra_share_links
  pyra_trash
  pyra_clients
  pyra_projects
  pyra_project_files
  pyra_file_approvals
  pyra_client_comments
  pyra_client_notifications
  pyra_client_password_resets
)

pg_query_old() {
  curl -s -X POST "$OLD_URL/pg/query" \
    -H "apikey: $OLD_KEY" \
    -H "Authorization: Bearer $OLD_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"query\": $(echo "$1" | jq -Rs .)}"
}

rest_get_old() {
  curl -s "$OLD_URL/rest/v1/$1" \
    -H "apikey: $OLD_KEY" \
    -H "Authorization: Bearer $OLD_KEY" \
    -H "Prefer: return=representation"
}

echo "=== Step 1: Export Schema for all tables ==="

for tbl in "${TABLES[@]}"; do
  echo "--- Schema: $tbl ---"
  
  # Columns
  pg_query_old "SELECT c.column_name, c.data_type, c.column_default, c.is_nullable, c.character_maximum_length, c.udt_name FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = '$tbl' ORDER BY c.ordinal_position" > "$OUT_DIR/schema_${tbl}_columns.json"
  
  # Constraints
  pg_query_old "SELECT tc.constraint_name, tc.constraint_type, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema LEFT JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema WHERE tc.table_schema = 'public' AND tc.table_name = '$tbl'" > "$OUT_DIR/schema_${tbl}_constraints.json"
  
  # Indexes
  pg_query_old "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = '$tbl'" > "$OUT_DIR/schema_${tbl}_indexes.json"
  
  echo "  columns: $(cat "$OUT_DIR/schema_${tbl}_columns.json" | jq length 2>/dev/null || echo 'error')"
done

echo ""
echo "=== Step 2: Export Data for all tables ==="

for tbl in "${TABLES[@]}"; do
  echo "--- Data: $tbl ---"
  
  # Get count first
  COUNT_JSON=$(rest_get_old "${tbl}?select=*&limit=0" 2>/dev/null)
  
  # Get all data (paginated)
  ALL_DATA="[]"
  OFFSET=0
  LIMIT=1000
  while true; do
    PAGE=$(rest_get_old "${tbl}?select=*&offset=${OFFSET}&limit=${LIMIT}" 2>/dev/null)
    PAGE_LEN=$(echo "$PAGE" | jq 'length' 2>/dev/null || echo "0")
    
    if [ "$PAGE_LEN" = "0" ] || [ "$PAGE_LEN" = "" ]; then
      break
    fi
    
    if [ "$ALL_DATA" = "[]" ]; then
      ALL_DATA="$PAGE"
    else
      ALL_DATA=$(echo "$ALL_DATA" "$PAGE" | jq -s 'add')
    fi
    
    if [ "$PAGE_LEN" -lt "$LIMIT" ]; then
      break
    fi
    OFFSET=$((OFFSET + LIMIT))
  done
  
  echo "$ALL_DATA" > "$OUT_DIR/data_${tbl}.json"
  TOTAL=$(echo "$ALL_DATA" | jq 'length' 2>/dev/null || echo "0")
  echo "  rows: $TOTAL"
done

echo ""
echo "=== Export Complete ==="
echo "Files saved in $OUT_DIR"
