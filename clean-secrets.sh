#!/bin/bash
set -e

echo "🔐 Cleaning secrets from current files..."

# Supabase JWT #1 (clinic - db.pyramedia.info)
SUPA1="***REMOVED***"

# Supabase JWT #2 (workspace - pyraworkspacedb)
SUPA2="***REMOVED***"

# Telegram bot tokens
TG1="***REMOVED***"
TG2="***REMOVED***"

# Google API keys
GAPI1="***REMOVED***"
GAPI2="***REMOVED***"
GAPI3="***REMOVED***"

# Replace in all tracked files (exclude node_modules, .git, antigravity)
find /home/node/openclaw -type f \
  \( -name "*.json" -o -name "*.js" -o -name "*.mjs" -o -name "*.sh" -o -name "*.md" -o -name "*.env" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/antigravity-awesome-skills/*" \
  -not -name "clean-secrets.sh" \
  -not -name "secrets-to-remove.txt" \
  -exec grep -l "$SUPA1\|$SUPA2\|$TG1\|$TG2\|$GAPI1\|$GAPI2\|$GAPI3" {} \; 2>/dev/null | while read -r file; do
    echo "  Cleaning: $file"
    sed -i "s|$SUPA1|REDACTED_SUPABASE_SERVICE_KEY_1|g" "$file"
    sed -i "s|$SUPA2|REDACTED_SUPABASE_SERVICE_KEY_2|g" "$file"
    sed -i "s|$TG1|REDACTED_TELEGRAM_BOT_TOKEN_1|g" "$file"
    sed -i "s|$TG2|REDACTED_TELEGRAM_BOT_TOKEN_2|g" "$file"
    sed -i "s|$GAPI1|REDACTED_GOOGLE_API_KEY_1|g" "$file"
    sed -i "s|$GAPI2|REDACTED_GOOGLE_API_KEY_2|g" "$file"
    sed -i "s|$GAPI3|REDACTED_GOOGLE_API_KEY_3|g" "$file"
done

echo "✅ Current files cleaned!"
