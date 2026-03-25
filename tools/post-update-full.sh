#!/bin/bash
# ============================================================
# PyraAI Post-Update FULL Recovery Script 🦊
# يشتغل بعد كل تحديث OpenClaw — يرجّع كل شي ضايع
# Usage: bash /home/node/openclaw/tools/post-update-full.sh
# ============================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

LOGFILE="/home/node/openclaw/memory/archive/post-update-$(date -u '+%Y%m%d-%H%M%S').md"
PERSISTENT_BIN="/home/node/openclaw/.persistent-bin"
LOCAL_BIN="/home/node/.local/bin"
WORKSPACE="/home/node/openclaw"
OPENCLAW_DIR="/home/node/.openclaw"
SUPABASE_BACKUP_URL="https://pyraworkspacedb.pyramedia.cloud/storage/v1/object/public/pyraai-workspace/backup/binaries"
TIMESTAMP=$(date -u '+%Y-%m-%d %H:%M:%S UTC')

ERRORS=0
FIXED=0
SKIPPED=0

log() { echo -e "$1"; echo "$2" >> "$LOGFILE"; }
ok()   { log "${GREEN}  ✅ $1${NC}" "- ✅ $1"; }
warn() { log "${YELLOW}  ⚠️  $1${NC}" "- ⚠️ $1"; FIXED=$((FIXED + 1)); }
fail() { log "${RED}  ❌ $1${NC}" "- ❌ $1"; ERRORS=$((ERRORS + 1)); }
skip() { log "${BLUE}  ⏭️  $1${NC}" "- ⏭️ $1"; SKIPPED=$((SKIPPED + 1)); }
header() { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; echo -e "\n## $1" >> "$LOGFILE"; }

mkdir -p "$(dirname "$LOGFILE")"
echo "# Post-Update Recovery — $TIMESTAMP" > "$LOGFILE"

echo -e "${BLUE}🦊 PyraAI Post-Update Recovery${NC}"
echo -e "   $(date -u '+%Y-%m-%d %H:%M:%S UTC')\n"

# ============================================================
# PHASE 1: CLI Binaries
# ============================================================
header "📦 Phase 1: CLI Binaries"

mkdir -p "$LOCAL_BIN" "$PERSISTENT_BIN"

restore_binary() {
  local bin="$1"
  if [ -f "$LOCAL_BIN/$bin" ] && [ -s "$LOCAL_BIN/$bin" ]; then
    # Verify it actually runs
    if "$LOCAL_BIN/$bin" --version >/dev/null 2>&1 || "$LOCAL_BIN/$bin" -version >/dev/null 2>&1; then
      ok "$bin present and working"
      return 0
    else
      warn "$bin exists but broken — restoring..."
    fi
  fi

  # Try persistent storage first
  if [ -f "$PERSISTENT_BIN/$bin" ] && [ -s "$PERSISTENT_BIN/$bin" ]; then
    cp "$PERSISTENT_BIN/$bin" "$LOCAL_BIN/$bin"
    chmod +x "$LOCAL_BIN/$bin"
    warn "$bin restored from persistent storage"
    return 0
  fi

  # Try Supabase backup
  curl -sL --max-time 30 "$SUPABASE_BACKUP_URL/$bin" -o "$LOCAL_BIN/$bin" 2>/dev/null
  if [ -s "$LOCAL_BIN/$bin" ]; then
    chmod +x "$LOCAL_BIN/$bin"
    warn "$bin restored from Supabase backup"
    return 0
  fi

  rm -f "$LOCAL_BIN/$bin"
  fail "$bin NOT FOUND anywhere!"
  return 1
}

for bin in yt-dlp ffmpeg ffprobe deno; do
  restore_binary "$bin" || true
done

# crawl is a wrapper script, just check existence
if [ -f "$LOCAL_BIN/crawl" ] && [ -s "$LOCAL_BIN/crawl" ]; then
  ok "crawl wrapper present"
elif [ -f "$PERSISTENT_BIN/crawl" ]; then
  cp "$PERSISTENT_BIN/crawl" "$LOCAL_BIN/crawl"
  chmod +x "$LOCAL_BIN/crawl"
  warn "crawl wrapper restored"
fi

# ============================================================
# PHASE 2: npm Packages
# ============================================================
header "📦 Phase 2: npm Packages (workspace)"

CRITICAL_NPM="better-sqlite3 sharp @supabase/supabase-js googleapis imapflow nodemailer"
NPM_MISSING=""

for pkg in $CRITICAL_NPM; do
  if ! node -e "require('$pkg')" 2>/dev/null; then
    NPM_MISSING="$NPM_MISSING $pkg"
  fi
done

if [ -n "$NPM_MISSING" ]; then
  warn "Missing npm packages:$NPM_MISSING — reinstalling..."
  cd "$WORKSPACE" && npm install --no-audit --no-fund 2>&1 | tail -5 >> "$LOGFILE"
  
  # Verify after install
  for pkg in $CRITICAL_NPM; do
    if node -e "require('$pkg')" 2>/dev/null; then
      ok "$pkg OK after reinstall"
    else
      fail "$pkg STILL MISSING after npm install!"
    fi
  done
else
  ok "All critical npm packages present"
fi

# ============================================================
# PHASE 3: Python / Crawl4AI
# ============================================================
header "🐍 Phase 3: Python / Crawl4AI"

# 3a. pip itself
if ! python3 -m pip --version >/dev/null 2>&1; then
  warn "pip missing — bootstrapping..."
  curl -sS https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py
  python3 /tmp/get-pip.py --user --break-system-packages 2>&1 | tail -3 >> "$LOGFILE"
  rm -f /tmp/get-pip.py
fi

# 3b. Crawl4AI
if python3 -c "import crawl4ai" 2>/dev/null; then
  CRAWL_VER=$(python3 -c "import crawl4ai; print(crawl4ai.__version__)" 2>/dev/null || echo "?")
  ok "Crawl4AI v$CRAWL_VER present"
else
  warn "Crawl4AI missing — reinstalling from requirements..."
  if [ -f "$PERSISTENT_BIN/pip-requirements.txt" ]; then
    python3 -m pip install -r "$PERSISTENT_BIN/pip-requirements.txt" --user --break-system-packages --quiet 2>&1 | tail -5 >> "$LOGFILE"
  else
    python3 -m pip install crawl4ai --user --break-system-packages --quiet 2>&1 | tail -3 >> "$LOGFILE"
  fi
  
  if python3 -c "import crawl4ai" 2>/dev/null; then
    ok "Crawl4AI restored successfully"
  else
    fail "Crawl4AI STILL NOT WORKING"
  fi
fi

# 3c. Chromium shared libs for Crawl4AI
DEPS_DIR="/home/node/.local/lib/chromium-deps"
if [ -d "$DEPS_DIR" ] && [ "$(ls "$DEPS_DIR" 2>/dev/null | wc -l)" -ge 10 ]; then
  ok "Chromium deps present ($(ls "$DEPS_DIR" | wc -l) libs)"
else
  warn "Chromium deps missing — restoring..."
  mkdir -p "$DEPS_DIR"
  curl -sL --max-time 60 "$SUPABASE_BACKUP_URL/chromium-deps.tar.gz" -o /tmp/chromium-deps.tar.gz 2>/dev/null
  if [ -s /tmp/chromium-deps.tar.gz ]; then
    cd /home/node/.local/lib && tar xzf /tmp/chromium-deps.tar.gz 2>/dev/null
    rm -f /tmp/chromium-deps.tar.gz
    ok "Chromium deps restored ($(ls "$DEPS_DIR" 2>/dev/null | wc -l) libs)"
  else
    fail "Chromium deps download failed — Crawl4AI won't work!"
  fi
fi

# 3d. Playwright browsers (for browser tool)
PW_CACHE="/home/node/.cache/ms-playwright"
if [ -d "$PW_CACHE" ] && [ "$(ls "$PW_CACHE" 2>/dev/null | wc -l)" -ge 1 ]; then
  ok "Playwright browsers cached ($(ls "$PW_CACHE" | head -3 | tr '\n' ', '))"
else
  warn "Playwright browsers missing — they'll auto-download on first use"
fi

# ============================================================
# PHASE 4: Git Config
# ============================================================
header "🔧 Phase 4: Git Config"

EXPECTED_NAME="PyraAI 🦊"
EXPECTED_EMAIL="pyraai@pyramedia.info"
CURRENT_NAME=$(git config --global user.name 2>/dev/null || echo "")
CURRENT_EMAIL=$(git config --global user.email 2>/dev/null || echo "")

if [ "$CURRENT_NAME" = "$EXPECTED_NAME" ] && [ "$CURRENT_EMAIL" = "$EXPECTED_EMAIL" ]; then
  ok "Git config correct ($EXPECTED_NAME <$EXPECTED_EMAIL>)"
else
  git config --global user.name "$EXPECTED_NAME"
  git config --global user.email "$EXPECTED_EMAIL"
  warn "Git config restored ($EXPECTED_NAME <$EXPECTED_EMAIL>)"
fi

# ============================================================
# PHASE 5: Memory & Database
# ============================================================
header "💾 Phase 5: Memory & Database"

DB_PATH="$OPENCLAW_DIR/memory/bayra.db"
if [ -f "$DB_PATH" ]; then
  COUNT=$(node -e "
    try {
      const db=require('better-sqlite3')('$DB_PATH',{readonly:true});
      console.log(db.prepare('SELECT COUNT(*) as c FROM memories').get().c);
      db.close();
    } catch(e) { console.log('ERROR:'+e.message); }
  " 2>/dev/null || echo "ERROR")
  
  if [[ "$COUNT" == ERROR* ]]; then
    fail "Memory DB exists but can't read: $COUNT"
  else
    ok "Memory DB: $COUNT memories"
  fi
else
  fail "Memory DB NOT FOUND at $DB_PATH!"
fi

# ============================================================
# PHASE 6: Directory Structure
# ============================================================
header "📁 Phase 6: Directory Structure"

REQUIRED_DIRS=(
  "/home/node/openclaw/.learnings"
  "/home/node/openclaw/memory"
  "/home/node/openclaw/memory/archive"
  "/home/node/openclaw/memory/ontology"
  "/home/node/openclaw/tools/proactive"
  "/home/node/openclaw/tools/monitor"
  "/home/node/openclaw/crawled"
)

for dir in "${REQUIRED_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    ok "$(basename "$dir")/ exists"
  else
    mkdir -p "$dir"
    warn "Created missing directory: $dir"
  fi
done

# ============================================================
# PHASE 7: ClawhHub Skills
# ============================================================
header "🧩 Phase 7: ClawhHub Skills"

SKILLS_DIR="$OPENCLAW_DIR/skills"
REQUIRED_SKILLS=(
  "self-improving-agent"
  "humanizer"
  "ontology"
  "mcporter"
  "frontend-design"
  "automation-workflows"
  "youtube-watcher"
  "n8n-workflow-automation"
  "markdown-converter"
  "proactive-agent"
)

MISSING_SKILLS=()
for skill in "${REQUIRED_SKILLS[@]}"; do
  if [ -f "$SKILLS_DIR/$skill/SKILL.md" ]; then
    ok "$skill"
  else
    MISSING_SKILLS+=("$skill")
    warn "$skill MISSING"
  fi
done

if [ ${#MISSING_SKILLS[@]} -gt 0 ]; then
  echo -e "${YELLOW}  Installing ${#MISSING_SKILLS[@]} missing skills...${NC}"
  for skill in "${MISSING_SKILLS[@]}"; do
    cd "$SKILLS_DIR" 2>/dev/null || cd "$WORKSPACE"
    npx clawhub@latest install "$skill" --no-input 2>/dev/null
    # clawhub sometimes installs to workspace/skills/
    if [ -d "$WORKSPACE/skills/$skill" ] && [ ! -d "$SKILLS_DIR/$skill" ]; then
      mv "$WORKSPACE/skills/$skill" "$SKILLS_DIR/" 2>/dev/null || true
    fi
    if [ -f "$SKILLS_DIR/$skill/SKILL.md" ]; then
      ok "$skill installed"
    else
      fail "$skill installation FAILED"
    fi
  done
fi

# ============================================================
# PHASE 8: LD_LIBRARY_PATH for Crawl4AI
# ============================================================
header "🔗 Phase 8: Environment Variables"

# LD_LIBRARY_PATH for Chromium deps
CHROMIUM_LD="/home/node/.local/lib/chromium-deps"
if [ -d "$CHROMIUM_LD" ]; then
  # Write helper that crawl4ai_helper.py already uses
  HELPER_ENV="$WORKSPACE/tools/.crawl4ai-env"
  echo "export LD_LIBRARY_PATH=$CHROMIUM_LD:\$LD_LIBRARY_PATH" > "$HELPER_ENV"
  ok "Crawl4AI LD_LIBRARY_PATH helper written"
else
  skip "No chromium-deps dir — skipping LD_LIBRARY_PATH"
fi

# ============================================================
# PHASE 9: Stale Locks & Sessions Cleanup
# ============================================================
header "🧹 Phase 9: Cleanup"

STALE_RESULT=$(bash "$WORKSPACE/tools/stale-lock-cleaner.sh" 2>&1)
echo "$STALE_RESULT" >> "$LOGFILE"
if echo "$STALE_RESULT" | grep -q "REPAIR_OK"; then
  warn "Cleaned stale locks/sessions"
else
  ok "No stale locks"
fi

# ============================================================
# PHASE 10: Update Persistent Cache
# ============================================================
header "💾 Phase 10: Update Persistent Cache"

for bin in yt-dlp ffmpeg ffprobe deno crawl; do
  if [ -f "$LOCAL_BIN/$bin" ] && [ -s "$LOCAL_BIN/$bin" ]; then
    if [ ! -s "$PERSISTENT_BIN/$bin" ] || [ "$LOCAL_BIN/$bin" -nt "$PERSISTENT_BIN/$bin" ]; then
      cp "$LOCAL_BIN/$bin" "$PERSISTENT_BIN/$bin"
      ok "Updated $bin in persistent cache"
    fi
  fi
done

# Save current pip freeze
python3 -m pip list --user --format=freeze > "$PERSISTENT_BIN/pip-requirements.txt" 2>/dev/null
ok "Updated pip requirements backup"

# ============================================================
# PHASE 11: Verify Critical Files
# ============================================================
header "📋 Phase 11: Critical Workspace Files"

CRITICAL_FILES=(
  "$WORKSPACE/SOUL.md"
  "$WORKSPACE/USER.md"
  "$WORKSPACE/AGENTS.md"
  "$WORKSPACE/MEMORY.md"
  "$WORKSPACE/TOOLS.md"
  "$WORKSPACE/HEARTBEAT.md"
  "$WORKSPACE/IDENTITY.md"
  "$WORKSPACE/tools/crawl4ai_helper.py"
  "$WORKSPACE/tools/post-update-repair.sh"
  "$WORKSPACE/tools/stale-lock-cleaner.sh"
  "$WORKSPACE/tools/memory/realtime-bridge.mjs"
)

for f in "${CRITICAL_FILES[@]}"; do
  if [ -f "$f" ] && [ -s "$f" ]; then
    ok "$(basename "$f")"
  else
    fail "$(basename "$f") MISSING or EMPTY!"
  fi
done

# ============================================================
# SUMMARY
# ============================================================
echo ""
echo -e "${BLUE}━━━ Summary ━━━${NC}"
echo "" >> "$LOGFILE"
echo "## 📊 Summary" >> "$LOGFILE"

echo -e "  Fixed:   ${GREEN}$FIXED${NC}" 
echo -e "  Errors:  ${RED}$ERRORS${NC}"
echo -e "  Skipped: ${BLUE}$SKIPPED${NC}"
echo "" >> "$LOGFILE"
echo "- Fixed: $FIXED" >> "$LOGFILE"
echo "- Errors: $ERRORS" >> "$LOGFILE"
echo "- Skipped: $SKIPPED" >> "$LOGFILE"

if [ $ERRORS -eq 0 ]; then
  echo -e "\n${GREEN}✅ All systems operational! 🦊${NC}"
  echo -e "\n**✅ All systems operational!**" >> "$LOGFILE"
  echo "POST_UPDATE_OK: Fixed=$FIXED, Errors=0"
else
  echo -e "\n${RED}⚠️  $ERRORS errors need manual attention!${NC}"
  echo -e "\n**⚠️ $ERRORS errors need manual attention!**" >> "$LOGFILE"
  echo "POST_UPDATE_WARN: Fixed=$FIXED, Errors=$ERRORS"
fi

echo -e "\n📄 Full log: $LOGFILE"
