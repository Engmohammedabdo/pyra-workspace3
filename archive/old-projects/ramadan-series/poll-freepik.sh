#!/bin/bash
TASK_ID="$1"
API_KEY="FPSXc309e2ce7d696c2b3196d1bb14409f2b"
MAX_POLLS=40  # 40 * 15s = 10 minutes max

for i in $(seq 1 $MAX_POLLS); do
  RESULT=$(curl -s -H "x-freepik-api-key: $API_KEY" \
    "https://api.freepik.com/v1/ai/video/kling-v3-omni/$TASK_ID" 2>/dev/null)
  STATUS=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['status'])" 2>/dev/null)
  
  echo "[$(date)] Poll $i: $STATUS"
  
  if [ "$STATUS" = "COMPLETED" ] || [ "$STATUS" = "FAILED" ]; then
    echo "$RESULT" | python3 -m json.tool
    exit 0
  fi
  
  sleep 15
done
echo "Timeout after $MAX_POLLS polls"
