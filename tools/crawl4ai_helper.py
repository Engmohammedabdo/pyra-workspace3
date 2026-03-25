"""
Crawl4AI Helper — PyraAI's web scraping tool
Usage:
  python3 crawl4ai_helper.py <url>                    # Single page → stdout
  python3 crawl4ai_helper.py <url> -o file.md         # Single page → file
  python3 crawl4ai_helper.py <url> --deep 10 -o dir/  # Deep crawl → directory
"""

import asyncio, sys, os, argparse

# Set env before imports
os.environ.setdefault("LD_LIBRARY_PATH", "/home/node/.local/lib/chromium-deps")

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

async def crawl_single(url, fit=True):
    """Crawl a single URL, return clean markdown."""
    browser_config = BrowserConfig(
        headless=True,
        verbose=False,
        extra_args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    )
    
    async with AsyncWebCrawler(config=browser_config) as crawler:
        result = await crawler.arun(url=url)
        if result.markdown:
            if fit and hasattr(result, 'fit_markdown') and result.fit_markdown:
                return result.fit_markdown
            return result.markdown
        elif result.status_code and result.status_code >= 400:
            raise Exception(f"HTTP {result.status_code}")
        else:
            return result.markdown or f"No content (HTTP {result.status_code})"

async def crawl_deep(url, max_pages=10):
    """Deep crawl a site, return list of (url, markdown) tuples."""
    browser_config = BrowserConfig(
        headless=True,
        verbose=False,
        extra_args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    )
    
    results = []
    async with AsyncWebCrawler(config=browser_config) as crawler:
        result = await crawler.arun(url=url)
        if result.status_code == 200:
            results.append((url, result.markdown))
            
            # Extract links for deep crawl
            if hasattr(result, 'links') and result.links:
                internal = [l['href'] for l in result.links.get('internal', []) if l.get('href')]
                for link in internal[:max_pages - 1]:
                    try:
                        r = await crawler.arun(url=link)
                        if r.status_code == 200:
                            results.append((link, r.markdown))
                    except:
                        pass
    return results

def main():
    parser = argparse.ArgumentParser(description='Crawl4AI Helper')
    parser.add_argument('url', help='URL to crawl')
    parser.add_argument('-o', '--output', help='Output file or directory')
    parser.add_argument('--deep', type=int, help='Deep crawl with max pages')
    parser.add_argument('--raw', action='store_true', help='Raw markdown (no fit)')
    args = parser.parse_args()
    
    # Suppress crawl4ai logs
    import logging
    logging.disable(logging.WARNING)
    
    if args.deep:
        results = asyncio.run(crawl_deep(args.url, args.deep))
        if args.output:
            os.makedirs(args.output, exist_ok=True)
            for i, (url, md) in enumerate(results):
                fname = f"{i:03d}-{url.split('/')[-1] or 'index'}.md"
                with open(os.path.join(args.output, fname), 'w') as f:
                    f.write(f"# Source: {url}\n\n{md}")
            print(f"✅ {len(results)} pages saved to {args.output}/", file=sys.stderr)
        else:
            for url, md in results:
                print(f"\n--- {url} ---\n{md}")
    else:
        md = asyncio.run(crawl_single(args.url, fit=not args.raw))
        if args.output:
            with open(args.output, 'w') as f:
                f.write(md)
            print(f"✅ Saved to {args.output} ({len(md)} chars)", file=sys.stderr)
        else:
            print(md)

if __name__ == '__main__':
    main()
