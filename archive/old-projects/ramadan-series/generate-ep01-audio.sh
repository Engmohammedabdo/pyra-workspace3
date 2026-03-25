#!/bin/bash
set -e

ELEVEN_KEY="sk_e36c12a0303527db9964630c0243a9d84b93154b8cad6517"
SUPA_URL="https://db.pyramedia.info"
SUPA_KEY="***REMOVED***"
BUCKET="pyraai-workspace"
BASE_PATH="projects/ramadan-series/audio/EP01"
AUDIO_DIR="/home/node/openclaw/ramadan-series/audio/EP01"

# Voice IDs
AHMED="IES4nrmZdUBHByLBde0P"
NORA="4wf10lgibMnboGJGCLrP"
PATIENT="LXrTqFIgiubkrMkwvOUr"
FRIEND="pCKbQ4EPGE06zpEPGNvS"

generate_and_upload() {
  local voice_id="$1"
  local text="$2"
  local filename="$3"
  local filepath="${AUDIO_DIR}/${filename}"
  local storage_path="${BASE_PATH}/${filename}"

  echo "🎙️ Generating: ${filename}..."
  
  # Generate TTS
  curl -s -X POST "https://api.elevenlabs.io/v1/text-to-speech/${voice_id}" \
    -H "xi-api-key: ${ELEVEN_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"text\": \"${text}\", \"model_id\": \"eleven_multilingual_v2\", \"voice_settings\": {\"stability\": 0.5, \"similarity_boost\": 0.75}}" \
    --output "${filepath}"

  # Check file
  local size=$(stat -f%z "${filepath}" 2>/dev/null || stat -c%s "${filepath}" 2>/dev/null)
  echo "   📦 File size: ${size} bytes"

  # Upload to Supabase Storage
  echo "   ☁️ Uploading to Supabase..."
  local response=$(curl -s -X POST \
    "${SUPA_URL}/storage/v1/object/${BUCKET}/${storage_path}" \
    -H "Authorization: Bearer ${SUPA_KEY}" \
    -H "Content-Type: audio/mpeg" \
    -H "x-upsert: true" \
    --data-binary "@${filepath}")
  
  echo "   ✅ Upload response: ${response}"
  echo ""
}

echo "========================================="
echo "🎬 EP01 Dialogue Generation - ElevenLabs"
echo "========================================="
echo ""

# Line 1: دكتور أحمد
generate_and_upload "$AHMED" "تلات مرضى… محجوزين من أسبوع… ومحدش جه." "ahmed-1.mp3"

# Line 2: نورا
generate_and_upload "$NORA" "مش بيرد… التاني مش بيرد… التالت كمان!" "nora-2.mp3"

# Line 3: المريض
generate_and_upload "$PATIENT" "أنا حاجز من يومين يا جماعة!" "patient-3.mp3"

# Line 4: نورا
generate_and_upload "$NORA" "اسمك مش موجود عندي يا أستاذ…" "nora-4.mp3"

# Line 5: المريض
generate_and_upload "$PATIENT" "إزاي مش موجود؟! أنا اتصلت وحجزت!" "patient-5.mp3"

# Line 6: دكتور أحمد
generate_and_upload "$AHMED" "حقك عليا يا أستاذ… بس احنا—" "ahmed-6.mp3"

# Line 7: المريض
generate_and_upload "$PATIENT" "لا مش حقي عليك! أنا هروح عيادة تانية!" "patient-7.mp3"

# Line 8: دكتور أحمد
generate_and_upload "$AHMED" "كده مش هينفع… لازم ألاقي حل!" "ahmed-8.mp3"

# Line 9: صاحب أحمد
generate_and_upload "$FRIEND" "أحمد… أنا عارف واحد حل لي نفس المشكلة بالظبط." "friend-9.mp3"

echo "========================================="
echo "✅ All dialogue lines generated & uploaded!"
echo "========================================="
