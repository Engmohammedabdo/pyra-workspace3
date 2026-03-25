#!/bin/bash
# EP01 Image Generation Script — Kie.ai API
set -euo pipefail

KIE_KEY="bb95f4d46f57be29c3181d55e246d403"
SUPA_URL="https://db.pyramedia.info"
SUPA_KEY="***REMOVED***"
BUCKET="pyraai-workspace"
OUTDIR="/home/node/openclaw/ramadan-series/images"
ASSETS_JSON="/home/node/openclaw/ramadan-series/EP01-assets.json"

mkdir -p "$OUTDIR"

# JSON output accumulator
echo '{"characters":{},"scenes":{}}' > "$ASSETS_JSON"

create_task() {
  local prompt="$1"
  curl -s -X POST "https://api.kie.ai/api/v1/jobs/createTask" \
    -H "Authorization: Bearer $KIE_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"model\": \"google/nano-banana\",
      \"callBackUrl\": \"https://example.com/callback\",
      \"input\": {
        \"prompt\": $(echo "$prompt" | jq -Rs .),
        \"output_format\": \"png\",
        \"image_size\": \"9:16\"
      }
    }"
}

poll_task() {
  local task_id="$1"
  local max_attempts=60
  local attempt=0
  while [ $attempt -lt $max_attempts ]; do
    local resp=$(curl -s "https://api.kie.ai/api/v1/jobs/recordInfo?taskId=$task_id" \
      -H "Authorization: Bearer $KIE_KEY")
    local state=$(echo "$resp" | jq -r '.data.state // .state // "unknown"')
    echo "  Poll #$attempt: state=$state" >&2
    if [ "$state" = "success" ]; then
      echo "$resp"
      return 0
    elif [ "$state" = "fail" ] || [ "$state" = "failed" ]; then
      echo "$resp"
      return 1
    fi
    sleep 10
    attempt=$((attempt + 1))
  done
  echo "TIMEOUT"
  return 1
}

get_download_url() {
  local url="$1"
  local resp=$(curl -s -X POST "https://api.kie.ai/api/v1/common/download-url" \
    -H "Authorization: Bearer $KIE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"$url\"}")
  echo "$resp" | jq -r '.data.url // .url // empty'
}

download_image() {
  local url="$1"
  local output="$2"
  # Try download URL endpoint first
  local dl_url=$(get_download_url "$url")
  if [ -n "$dl_url" ] && [ "$dl_url" != "null" ]; then
    curl -sL -o "$output" "$dl_url"
  else
    curl -sL -o "$output" "$url"
  fi
}

upload_to_supabase() {
  local file="$1"
  local path="$2"
  curl -s -X POST "$SUPA_URL/storage/v1/object/$BUCKET/$path" \
    -H "Authorization: Bearer $SUPA_KEY" \
    -H "Content-Type: image/png" \
    --data-binary "@$file"
  echo "$SUPA_URL/storage/v1/object/public/$BUCKET/$path"
}

update_json() {
  local category="$1"  # characters or scenes
  local key="$2"
  local url="$3"
  local tmp=$(mktemp)
  jq --arg cat "$category" --arg key "$key" --arg url "$url" \
    '.[$cat][$key] = $url' "$ASSETS_JSON" > "$tmp" && mv "$tmp" "$ASSETS_JSON"
}

process_image() {
  local name="$1"
  local prompt="$2"
  local category="$3"  # characters or scenes
  local supa_path="$4"
  
  echo "=== Processing: $name ===" >&2
  
  local retries=0
  while [ $retries -lt 2 ]; do
    echo "  Creating task (attempt $((retries+1)))..." >&2
    local create_resp=$(create_task "$prompt")
    local task_id=$(echo "$create_resp" | jq -r '.data.task_id // .data.taskId // .taskId // .task_id // empty')
    
    if [ -z "$task_id" ] || [ "$task_id" = "null" ]; then
      echo "  ERROR: No taskId returned: $create_resp" >&2
      retries=$((retries + 1))
      sleep 5
      continue
    fi
    
    echo "  TaskId: $task_id" >&2
    
    local poll_resp
    if poll_resp=$(poll_task "$task_id"); then
      # Extract image URL from result
      local img_url=$(echo "$poll_resp" | jq -r '
        .data.resultJson // .resultJson // empty' | jq -r '
        if type == "array" then .[0].url // .[0] 
        elif type == "object" then .url // .image_url // .output // empty
        else . end' 2>/dev/null)
      
      # Fallback: try direct fields
      if [ -z "$img_url" ] || [ "$img_url" = "null" ]; then
        img_url=$(echo "$poll_resp" | jq -r '.data.resultJson' 2>/dev/null | jq -r '.[0]' 2>/dev/null)
      fi
      if [ -z "$img_url" ] || [ "$img_url" = "null" ]; then
        img_url=$(echo "$poll_resp" | jq -r '.data.result_url // .data.output_url // empty' 2>/dev/null)
      fi
      
      if [ -n "$img_url" ] && [ "$img_url" != "null" ]; then
        local local_file="$OUTDIR/${name}.png"
        echo "  Downloading to $local_file..." >&2
        download_image "$img_url" "$local_file"
        
        if [ -s "$local_file" ]; then
          echo "  Uploading to Supabase: $supa_path..." >&2
          local public_url=$(upload_to_supabase "$local_file" "$supa_path")
          echo "  ✅ Done: $public_url" >&2
          update_json "$category" "$name" "$public_url"
          return 0
        else
          echo "  ERROR: Downloaded file is empty" >&2
        fi
      else
        echo "  ERROR: Could not extract image URL from response" >&2
        echo "  Raw response: $poll_resp" >&2
      fi
    else
      echo "  ERROR: Task failed or timed out" >&2
    fi
    
    retries=$((retries + 1))
    [ $retries -lt 2 ] && echo "  Retrying..." >&2 && sleep 5
  done
  
  echo "  ❌ FAILED after 2 attempts: $name" >&2
  update_json "$category" "$name" "FAILED"
  return 1
}

echo "🎬 Starting EP01 Image Generation..." >&2
echo "================================================" >&2

# Characters
process_image "dr-ahmed" \
  "Photorealistic portrait of a 40-year-old Egyptian male dentist in Dubai. He wears a white lab coat over a light blue shirt, thin-framed glasses, short dark hair with slight grey at temples, clean-shaven with light stubble, tired but professional expression. Modern dental clinic background with white and blue decor. Shot on Canon EOS R5, 85mm f/1.4, natural lighting, 4K quality" \
  "characters" \
  "projects/ramadan-series/characters/dr-ahmed.png"

process_image "noura" \
  "Photorealistic portrait of a 30-year-old Arab female dental assistant in Dubai. She wears light blue medical scrubs, hair pulled back neatly under a medical cap, warm brown eyes, stressed but caring expression. Standing at a clinic reception desk with papers and a computer. Shot on Canon EOS R5, 85mm f/1.4, soft clinical lighting, 4K quality" \
  "characters" \
  "projects/ramadan-series/characters/noura.png"

process_image "angry-patient" \
  "Photorealistic portrait of a 35-year-old Arab man holding his cheek in pain, wearing a casual white t-shirt, short beard, frustrated angry expression. Standing in a dental clinic waiting area in Dubai. Shot on Canon EOS R5, 85mm f/1.4, natural lighting, 4K quality" \
  "characters" \
  "projects/ramadan-series/characters/angry-patient.png"

process_image "ahmed-friend" \
  "Photorealistic portrait of a 40-year-old Arab man in a modern Dubai Marina cafe. He wears a casual navy polo shirt, well-groomed short beard, friendly confident smile, holding a coffee cup. Warm ambient cafe lighting with Dubai skyline visible through windows. Shot on Canon EOS R5, 85mm f/1.4, warm lighting, 4K quality" \
  "characters" \
  "projects/ramadan-series/characters/ahmed-friend.png"

process_image "mohammed" \
  "Photorealistic portrait of a late-20s Egyptian man, founder of a tech company in Dubai. He wears a black polo shirt with a small gold pyramid logo on chest, dark jeans, light neat beard, short dark hair, confident warm smile. Modern open-space office with navy blue and gold decor, large screens on walls. Shot on Canon EOS R5, 85mm f/1.4, warm office lighting, 4K quality" \
  "characters" \
  "projects/ramadan-series/characters/mohammed.png"

process_image "bayra" \
  "Photorealistic portrait of a mid-20s Arab woman, AI assistant character. She wears a modern turquoise hijab, thin elegant glasses, white blouse, warm intelligent smile. Subtle cyan/turquoise glow (#00D4FF) around her. Clean tech background with floating data visualizations. Shot on Canon EOS R5, 85mm f/1.4, studio lighting with subtle cyan rim light, 4K quality" \
  "characters" \
  "projects/ramadan-series/characters/bayra.png"

echo "" >&2
echo "🎬 Characters done. Starting EP01 scenes..." >&2
echo "================================================" >&2

# Scenes
process_image "hook-schedule" \
  "Close-up shot of a paper appointment schedule on a clinic desk. A hand holding a red pen is crossing out 3 patient names one by one. The schedule shows Arabic names and times. Dramatic lighting, shallow depth of field. Shot on Canon EOS R5, 50mm f/1.2, 4K quality" \
  "scenes" \
  "projects/ramadan-series/storyboard/EP01/hook-schedule.png"

process_image "empty-clinic" \
  "Wide shot of a modern dental clinic waiting room in Dubai. 3 empty chairs in a row, fluorescent lighting, white and light blue decor. A 40-year-old Egyptian male dentist in white coat stands alone looking at his watch, sighing. Empty, quiet, lonely atmosphere. Shot on Canon EOS R5, 24mm f/2.8, 4K quality" \
  "scenes" \
  "projects/ramadan-series/storyboard/EP01/empty-clinic.png"

process_image "noura-phone" \
  "Medium shot of a 30-year-old Arab female dental assistant in blue scrubs at a reception desk. She's holding a phone to her ear with a frustrated expression. Computer screen shows 'No Answer' in Arabic. Papers scattered on desk. Shot on Canon EOS R5, 50mm f/1.4, clinical lighting, 4K quality" \
  "scenes" \
  "projects/ramadan-series/storyboard/EP01/noura-phone.png"

process_image "angry-patient-reception" \
  "Medium-wide shot inside a dental clinic reception in Dubai. An angry 35-year-old Arab man holding his cheek confronts a stressed female receptionist in blue scrubs. A 40-year-old dentist in white coat tries to calm the situation. Tense atmosphere, fluorescent lighting. Shot on Canon EOS R5, 35mm f/2.0, 4K quality" \
  "scenes" \
  "projects/ramadan-series/storyboard/EP01/angry-patient-reception.png"

process_image "ahmed-breakdown" \
  "Medium shot of a 40-year-old Egyptian dentist sitting alone in his small office. He's rubbing his face with his hands in frustration. An open laptop shows a messy colorful Excel spreadsheet. Medical certificates on the wall. Moody dramatic lighting. Shot on Canon EOS R5, 50mm f/1.4, 4K quality" \
  "scenes" \
  "projects/ramadan-series/storyboard/EP01/ahmed-breakdown.png"

process_image "cafe-scene" \
  "Two Arab men in their 40s sitting at a modern Dubai Marina cafe. One in white coat (came from clinic), looking stressed. The other in navy polo, smiling confidently, showing his phone screen to his friend. The phone screen shows a gold pyramid logo (Pyramedia). Warm ambient cafe lighting, Dubai skyline through windows. Shot on Canon EOS R5, 35mm f/2.0, 4K quality" \
  "scenes" \
  "projects/ramadan-series/storyboard/EP01/cafe-scene.png"

echo "" >&2
echo "================================================" >&2
echo "🎬 ALL DONE! Assets saved to $ASSETS_JSON" >&2
cat "$ASSETS_JSON" >&2
