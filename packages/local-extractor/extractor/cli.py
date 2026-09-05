import sys
import os
import json
import argparse

try:
    from .chromium import ChromiumExtractor
    from .firefox import FirefoxExtractor
except ImportError:
    sys.path.insert(0, os.path.dirname(__file__))
    from chromium import ChromiumExtractor
    from firefox import FirefoxExtractor

def main():
    parser = argparse.ArgumentParser(description="CookieNexus Local Browser Credential Extractor")
    parser.add_argument("--browser", choices=["chrome", "edge", "firefox"], default="chrome", help="Target browser")
    parser.add_argument("--domain", help="Filter by domain pattern (e.g. github.com)")
    parser.add_argument("--format", choices=["json", "header", "netscape"], default="json", help="Output format")
    parser.add_argument("--out", help="Output file path (default: stdout)")

    args = parser.parse_args()

    if args.browser in ("chrome", "edge"):
        cookies = ChromiumExtractor.extract_cookies(browser=args.browser, domain_filter=args.domain)
    else:
        cookies = FirefoxExtractor.extract_cookies(domain_filter=args.domain)

    if args.format == "header":
        output = "; ".join(f"{c['name']}={c['value']}" for c in cookies)
    elif args.format == "netscape":
        lines = ["# Netscape HTTP Cookie File", ""]
        for c in cookies:
            dom = c['domain']
            flag = "TRUE" if dom.startswith(".") else "FALSE"
            sec = "TRUE" if c['secure'] else "FALSE"
            exp = int(c.get('expirationDate') or 0)
            lines.append(f"{dom}\t{flag}\t{c['path']}\t{sec}\t{exp}\t{c['name']}\t{c['value']}")
        output = "\n".join(lines)
    else:
        output = json.dumps(cookies, indent=2)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(output)
        print(f"Extracted {len(cookies)} cookies to {args.out}")
    else:
        print(output)

if __name__ == "__main__":
    main()
