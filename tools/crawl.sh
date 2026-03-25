#!/bin/bash
# crawl.sh — Crawl4AI wrapper for PyraAI
# Usage: crawl.sh <url> [output_file] [options]
# Options: --deep <max_pages> | --extract "<question>" | --fit (clean markdown)

export LD_LIBRARY_PATH="/home/node/.local/lib/chromium-deps:$LD_LIBRARY_PATH"
export PATH="/home/node/.local/bin:$PATH"

URL="$1"
OUTPUT="$2"
shift 2 2>/dev/null

if [ -z "$URL" ]; then
  echo "Usage: crawl.sh <url> [output_file] [--deep N] [--extract 'question'] [--fit]"
  exit 1
fi

# Build Python script dynamically
PYTHON_SCRIPT="
import asyncio, sys
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

async def main():
    browser_config = BrowserConfig(
        headless=True,
        extra_args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    )
    run_config = CrawlerRunConfig()
    
    async with AsyncWebCrawler(config=browser_config) as crawler:
        result = await crawler.arun(url='${URL}', config=run_config)
        
        if result.status_code == 200:
            content = result.fit_markdown if hasattr(result, 'fit_markdown') and result.fit_markdown else result.markdown
            print(content)
        else:
            print(f'ERROR: HTTP {result.status_code}', file=sys.stderr)
            sys.exit(1)

asyncio.run(main())
"

if [ -n "$OUTPUT" ] && [ "${OUTPUT:0:2}" != "--" ]; then
  python3 -c "$PYTHON_SCRIPT" > "$OUTPUT" 2>/dev/null
  if [ $? -eq 0 ]; then
    echo "✅ Saved to $OUTPUT ($(wc -c < "$OUTPUT") bytes)"
  else
    echo "❌ Crawl failed"
    exit 1
  fi
else
  python3 -c "$PYTHON_SCRIPT" 2>/dev/null
fi
