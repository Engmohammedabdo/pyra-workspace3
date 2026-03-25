#!/bin/bash
# ============================================
# PyraAI Post-Update Auto-Repair Script 🦊
# يشتغل تلقائي بعد كل تحديث OpenClaw
# ============================================

set -e
LOGFILE="/home/node/openclaw/memory/archive/repair-log-auto.md"
PERSISTENT_BIN="/home/node/openclaw/.persistent-bin"
LOCAL_BIN="/home/node/.local/bin"
WORKSPACE="/home/node/openclaw"
TIMESTAMP=$(date -u '+%Y-%m-%d %H:%M:%S UTC')
SUPABASE_BACKUP_URL="https://pyraworkspacedb.pyramedia.cloud/storage/v1/object/public/pyraai-workspace/backup/binaries"

echo "# Auto-Repair Log — $TIMESTAMP" > "$LOGFILE"
echo "" >> "$LOGFILE"

ERRORS=0
FIXED=0

# ====== 1. Restore binaries from persistent storage ======
echo "## 📦 Phase 1: Restore Binaries" >> "$LOGFILE"
mkdir -p "$LOCAL_BIN"

for bin in yt-dlp ffmpeg ffprobe deno crawl gh; do
  # Check if file exists AND is non-zero
  if [ -f "$LOCAL_BIN/$bin" ] && [ -s "$LOCAL_BIN/$bin" ]; then
    echo "- ✅ $bin already present" >> "$LOGFILE"
  elif [ -f "$PERSISTENT_BIN/$bin" ] && [ -s "$PERSISTENT_BIN/$bin" ]; then
    cp "$PERSISTENT_BIN/$bin" "$LOCAL_BIN/$bin"
    chmod +x "$LOCAL_BIN/$bin"
    echo "- ✅ Restored $bin from persistent storage" >> "$LOGFILE"
    FIXED=$((FIXED + 1))
  else
    # Try Supabase backup (public URL)
    echo "- ⚠️ $bin missing everywhere — downloading from Supabase..." >> "$LOGFILE"
    curl -sL "$SUPABASE_BACKUP_URL/$bin" -o "$LOCAL_BIN/$bin" 2>/dev/null
    if [ -s "$LOCAL_BIN/$bin" ]; then
      chmod +x "$LOCAL_BIN/$bin"
      echo "- ✅ Restored $bin from Supabase backup" >> "$LOGFILE"
      FIXED=$((FIXED + 1))
    else
      rm -f "$LOCAL_BIN/$bin"
      echo "- ❌ $bin NOT FOUND anywhere!" >> "$LOGFILE"
      ERRORS=$((ERRORS + 1))
    fi
  fi
done

# ====== 2. Check better-sqlite3 (in persistent node_modules) ======
echo "" >> "$LOGFILE"
echo "## 🧠 Phase 2: npm packages" >> "$LOGFILE"

if node -e "require('better-sqlite3')" 2>/dev/null; then
  echo "- ✅ better-sqlite3 OK" >> "$LOGFILE"
else
  echo "- ⚠️ better-sqlite3 broken — rebuilding native modules..." >> "$LOGFILE"
  cd "$WORKSPACE" && npm rebuild 2>&1 | tail -5 >> "$LOGFILE"
  if node -e "require('better-sqlite3')" 2>/dev/null; then
    echo "- ✅ better-sqlite3 fixed via npm rebuild" >> "$LOGFILE"
    FIXED=$((FIXED + 1))
  else
    echo "- ⚠️ Rebuild failed, trying full npm install..." >> "$LOGFILE"
    cd "$WORKSPACE" && npm install --no-audit --no-fund 2>&1 | tail -5 >> "$LOGFILE"
    FIXED=$((FIXED + 1))
  fi
fi

# Check other critical npm packages
for pkg in sharp @supabase/supabase-js googleapis; do
  if ! node -e "require('$pkg')" 2>/dev/null; then
    echo "- ⚠️ $pkg missing — running npm install..." >> "$LOGFILE"
    cd "$WORKSPACE" && npm install --no-audit --no-fund 2>&1 | tail -3 >> "$LOGFILE"
    FIXED=$((FIXED + 1))
    break
  fi
done

# ====== 3. Check Python packages (Crawl4AI) ======
echo "" >> "$LOGFILE"
echo "## 🐍 Phase 3: Python packages" >> "$LOGFILE"

if python3 -c "import crawl4ai" 2>/dev/null; then
  echo "- ✅ Crawl4AI OK" >> "$LOGFILE"
else
  echo "- ⚠️ Reinstalling Python packages..." >> "$LOGFILE"
  # Bootstrap pip first if needed
  if ! python3 -m pip --version 2>/dev/null; then
    curl -sS https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py
    python3 /tmp/get-pip.py --user --break-system-packages 2>&1 | tail -2 >> "$LOGFILE"
  fi
  # Try restoring from saved requirements first
  if [ -f "$PERSISTENT_BIN/pip-requirements.txt" ]; then
    python3 -m pip install -r "$PERSISTENT_BIN/pip-requirements.txt" --user --break-system-packages 2>&1 | tail -5 >> "$LOGFILE"
  else
    python3 -m pip install crawl4ai --user --break-system-packages 2>&1 | tail -3 >> "$LOGFILE"
  fi
  FIXED=$((FIXED + 1))
fi

# Chromium deps
DEPS_DIR="/home/node/.local/lib/chromium-deps"
if [ ! -d "$DEPS_DIR" ] || [ $(ls "$DEPS_DIR" 2>/dev/null | wc -l) -lt 10 ]; then
  echo "- ⚠️ Chromium deps missing — restoring..." >> "$LOGFILE"
  mkdir -p "$DEPS_DIR"
  # Try persistent-bin first (faster, local)
  if [ -d "$PERSISTENT_BIN/chromium-deps" ] && [ "$(ls $PERSISTENT_BIN/chromium-deps/ 2>/dev/null | wc -l)" -ge 10 ]; then
    cp "$PERSISTENT_BIN/chromium-deps/"* "$DEPS_DIR/" 2>/dev/null
    echo "- ✅ Chromium deps restored from persistent-bin ($(ls $DEPS_DIR | wc -l) libs)" >> "$LOGFILE"
    FIXED=$((FIXED + 1))
  else
    # Fallback to Supabase
    curl -sL "$SUPABASE_BACKUP_URL/chromium-deps.tar.gz" -o /tmp/chromium-deps.tar.gz 2>/dev/null
    if [ -s /tmp/chromium-deps.tar.gz ]; then
      cd /home/node/.local/lib && tar xzf /tmp/chromium-deps.tar.gz 2>/dev/null
      rm -f /tmp/chromium-deps.tar.gz
      echo "- ✅ Chromium deps restored from Supabase ($(ls $DEPS_DIR | wc -l) libs)" >> "$LOGFILE"
      FIXED=$((FIXED + 1))
    else
      echo "- ❌ Chromium deps NOT FOUND — Crawl4AI may not work" >> "$LOGFILE"
      ERRORS=$((ERRORS + 1))
    fi
  fi
else
  echo "- ✅ Chromium deps OK ($(ls $DEPS_DIR | wc -l) libs)" >> "$LOGFILE"
fi

# ====== 4. Verify Memory DB ======
echo "" >> "$LOGFILE"
echo "## 💾 Phase 4: Memory DB" >> "$LOGFILE"

DB_PATH="/home/node/.openclaw/memory/bayra.db"
if [ -f "$DB_PATH" ]; then
  COUNT=$(node -e "const db=require('better-sqlite3')('$DB_PATH',{readonly:true}); console.log(db.prepare('SELECT COUNT(*) as c FROM memories').get().c); db.close()" 2>/dev/null || echo "ERROR")
  echo "- ✅ Memory DB: $COUNT memories" >> "$LOGFILE"
else
  echo "- ❌ Memory DB NOT FOUND!" >> "$LOGFILE"
  ERRORS=$((ERRORS + 1))
fi

# ====== 5. Update persistent bin cache ======
echo "" >> "$LOGFILE"
echo "## 🔄 Phase 5: Update persistent cache" >> "$LOGFILE"
mkdir -p "$PERSISTENT_BIN"

for bin in yt-dlp ffmpeg ffprobe deno crawl gh; do
  if [ -f "$LOCAL_BIN/$bin" ] && [ -s "$LOCAL_BIN/$bin" ]; then
    # Only copy if persistent is missing/empty or local is newer
    if [ ! -s "$PERSISTENT_BIN/$bin" ] || [ "$LOCAL_BIN/$bin" -nt "$PERSISTENT_BIN/$bin" ]; then
      cp "$LOCAL_BIN/$bin" "$PERSISTENT_BIN/$bin"
      echo "- 🔄 Updated $bin in persistent cache" >> "$LOGFILE"
    fi
  fi
done

# ====== 5b. Restore chrome-wrapper.sh ======
if [ ! -f "$LOCAL_BIN/chrome-wrapper.sh" ]; then
  if [ -f "$PERSISTENT_BIN/chrome-wrapper.sh" ]; then
    cp "$PERSISTENT_BIN/chrome-wrapper.sh" "$LOCAL_BIN/chrome-wrapper.sh"
    chmod +x "$LOCAL_BIN/chrome-wrapper.sh"
    echo "- ✅ chrome-wrapper.sh restored from persistent" >> "$LOGFILE"
    FIXED=$((FIXED + 1))
  fi
fi

# ====== 6. Playwright Browsers ======
echo "" >> "$LOGFILE"
echo "## 🎭 Phase 6: Playwright Browsers" >> "$LOGFILE"

PLAYWRIGHT_DIR="/home/node/.cache/ms-playwright"
if [ -d "$PLAYWRIGHT_DIR" ] && [ "$(ls -d $PLAYWRIGHT_DIR/chromium-* 2>/dev/null | wc -l)" -gt 0 ]; then
  echo "- ✅ Playwright browsers OK ($(du -sh $PLAYWRIGHT_DIR 2>/dev/null | cut -f1))" >> "$LOGFILE"
else
  echo "- ⚠️ Playwright browsers missing — reinstalling..." >> "$LOGFILE"
  # Try patchright first (our primary browser), fallback to playwright
  if python3 -c "import patchright" 2>/dev/null; then
    python3 -m patchright install chromium 2>&1 | tail -3 >> "$LOGFILE"
  elif python3 -c "import playwright" 2>/dev/null; then
    python3 -m playwright install chromium 2>&1 | tail -3 >> "$LOGFILE"
  elif command -v npx >/dev/null 2>&1; then
    npx playwright install chromium 2>&1 | tail -3 >> "$LOGFILE"
  fi
  if [ -d "$PLAYWRIGHT_DIR" ] && [ "$(ls -d $PLAYWRIGHT_DIR/chromium-* 2>/dev/null | wc -l)" -gt 0 ]; then
    echo "- ✅ Playwright browsers restored" >> "$LOGFILE"
    FIXED=$((FIXED + 1))
  else
    echo "- ❌ Playwright browsers could NOT be restored" >> "$LOGFILE"
    ERRORS=$((ERRORS + 1))
  fi
fi

# ====== 7. LCM Extension (lossless-claw) ======
echo "" >> "$LOGFILE"
echo "## 🧩 Phase 7: LCM Extension" >> "$LOGFILE"

LCM_DIR="/home/node/.openclaw/extensions/lossless-claw"
if [ -f "$LCM_DIR/index.ts" ] && [ -f "$LCM_DIR/package.json" ]; then
  echo "- ✅ LCM extension OK" >> "$LOGFILE"
  # Check if node_modules exist
  if [ ! -d "$LCM_DIR/node_modules" ]; then
    echo "- ⚠️ LCM node_modules missing — running npm install..." >> "$LOGFILE"
    cd "$LCM_DIR" && npm install --no-audit --no-fund 2>&1 | tail -3 >> "$LOGFILE"
    FIXED=$((FIXED + 1))
  fi
else
  echo "- ❌ LCM extension missing! Need manual reinstall" >> "$LOGFILE"
  echo "  Run: cd /home/node/.openclaw/extensions && git clone <lossless-claw-repo>" >> "$LOGFILE"
  ERRORS=$((ERRORS + 1))
fi

# ====== 8. Antfarm ======
echo "" >> "$LOGFILE"
echo "## 🐜 Phase 8: Antfarm" >> "$LOGFILE"

ANTFARM_DB="/home/node/.openclaw/antfarm/antfarm.db"
ANTFARM_CLI_CANDIDATES=(
  "/home/node/.openclaw/workspace/antfarm/dist/cli/cli.js"
  "/home/node/.openclaw/antfarm/node_modules/antfarm/dist/cli/cli.js"
)
ANTFARM_CLI_FOUND=""
for cli in "${ANTFARM_CLI_CANDIDATES[@]}"; do
  if [ -f "$cli" ]; then
    ANTFARM_CLI_FOUND="$cli"
    break
  fi
done

if [ -f "$ANTFARM_DB" ]; then
  echo "- ✅ Antfarm DB exists" >> "$LOGFILE"
else
  echo "- ⚠️ Antfarm DB missing" >> "$LOGFILE"
fi

if [ -n "$ANTFARM_CLI_FOUND" ]; then
  echo "- ✅ Antfarm CLI found: $ANTFARM_CLI_FOUND" >> "$LOGFILE"
else
  echo "- ⚠️ Antfarm CLI not found — may need reinstall" >> "$LOGFILE"
  echo "  Expected paths: ${ANTFARM_CLI_CANDIDATES[*]}" >> "$LOGFILE"
fi

# ====== Summary ======
echo "" >> "$LOGFILE"
echo "## 📊 Summary" >> "$LOGFILE"
echo "- Fixed: $FIXED" >> "$LOGFILE"
echo "- Errors: $ERRORS" >> "$LOGFILE"
echo "- Timestamp: $TIMESTAMP" >> "$LOGFILE"

# Clean stale session locks
bash /home/node/openclaw/tools/stale-lock-cleaner.sh 2>/dev/null

# --- Check ClawhHub Skills ---
SKILLS_DIR="/home/node/.openclaw/skills"
REQUIRED_SKILLS="self-improving-agent humanizer ontology mcporter frontend-design automation-workflows youtube-watcher n8n-workflow-automation markdown-converter proactive-agent"
for skill in $REQUIRED_SKILLS; do
  if [ ! -f "$SKILLS_DIR/$skill/SKILL.md" ]; then
    echo "⚠️ Missing skill: $skill — reinstalling..." >> "$LOGFILE"
    cd "$SKILLS_DIR" && npx clawhub@latest install "$skill" --no-input 2>/dev/null
    if [ -f "/home/node/openclaw/skills/$skill/SKILL.md" ]; then
      mv "/home/node/openclaw/skills/$skill" "$SKILLS_DIR/" 2>/dev/null
    fi
    if [ -f "$SKILLS_DIR/$skill/SKILL.md" ]; then
      echo "  ✅ Restored $skill" >> "$LOGFILE"
      FIXED=$((FIXED + 1))
    else
      echo "  ❌ Failed to restore $skill" >> "$LOGFILE"
      ERRORS=$((ERRORS + 1))
    fi
  fi
done

# --- Check Git config ---
if ! git config --global user.name >/dev/null 2>&1; then
  git config --global user.name "PyraAI 🦊"
  git config --global user.email "pyraai@pyramedia.info"
  echo "- ✅ Restored git config" >> "$LOGFILE"
  FIXED=$((FIXED + 1))
fi

# --- Check .learnings directory ---
mkdir -p /home/node/openclaw/.learnings 2>/dev/null
mkdir -p /home/node/openclaw/memory/ontology 2>/dev/null

if [ $ERRORS -eq 0 ]; then
  echo "" >> "$LOGFILE"
  echo "**✅ All systems operational!**" >> "$LOGFILE"
  echo "REPAIR_OK: Fixed=$FIXED, Errors=$ERRORS"
else
  echo "" >> "$LOGFILE"
  echo "**⚠️ $ERRORS errors need manual attention!**" >> "$LOGFILE"
  echo "REPAIR_WARN: Fixed=$FIXED, Errors=$ERRORS"
fi
