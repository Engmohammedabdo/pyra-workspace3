#!/bin/bash
# 🛡️ Rollback Script — يرجع كل شي لما قبل Sprint 2
# Usage: bash /home/node/openclaw/tools/memory/rollback.sh

echo "⚠️ Rolling back memory system to pre-Sprint2 state..."

MEMORY_DIR="/home/node/openclaw/tools/memory"
DB_DIR="/home/node/.openclaw/memory"

# Restore code files
for f in db.mjs search.mjs ingest.mjs lifecycle.mjs memory-manager.mjs; do
  if [ -f "$MEMORY_DIR/${f}.backup-sprint1" ]; then
    cp "$MEMORY_DIR/${f}.backup-sprint1" "$MEMORY_DIR/$f"
    echo "✅ Restored $f"
  else
    echo "❌ No backup for $f"
  fi
done

# Restore database
if [ -f "$DB_DIR/bayra.db.backup-sprint1" ]; then
  cp "$DB_DIR/bayra.db.backup-sprint1" "$DB_DIR/bayra.db"
  echo "✅ Restored bayra.db"
else
  echo "❌ No DB backup found"
fi

# Remove auto-ingest if it was added
if [ -f "$MEMORY_DIR/auto-ingest.mjs" ]; then
  mv "$MEMORY_DIR/auto-ingest.mjs" "$MEMORY_DIR/auto-ingest.mjs.disabled"
  echo "✅ Disabled auto-ingest.mjs"
fi

echo ""
echo "🔄 Rollback complete! Run 'node cli.mjs health' to verify."
