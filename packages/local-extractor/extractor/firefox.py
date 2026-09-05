import os
import sys
import glob
import sqlite3
import shutil
import tempfile
from typing import List, Dict, Any, Optional

class FirefoxExtractor:
    @staticmethod
    def get_firefox_profile_path() -> Optional[str]:
        if sys.platform == "win32":
            base = os.path.join(os.environ.get("APPDATA", ""), "Mozilla", "Firefox", "Profiles")
        elif sys.platform == "darwin":
            base = os.path.expanduser("~/Library/Application Support/Firefox/Profiles")
        else:
            base = os.path.expanduser("~/.mozilla/firefox")

        if not os.path.exists(base):
            return None

        # Look for *.default-release or *.default
        matches = glob.glob(os.path.join(base, "*default*"))
        return matches[0] if matches else None

    @staticmethod
    def extract_cookies(domain_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        profile_path = FirefoxExtractor.get_firefox_profile_path()
        if not profile_path:
            return []

        cookies_sqlite = os.path.join(profile_path, "cookies.sqlite")
        if not os.path.exists(cookies_sqlite):
            return []

        temp_dir = tempfile.mkdtemp()
        temp_db = os.path.join(temp_dir, "cookies.sqlite.tmp")
        try:
            shutil.copy2(cookies_sqlite, temp_db)
            conn = sqlite3.connect(temp_db)
            cursor = conn.cursor()

            query = "SELECT host, name, path, value, isSecure, isHttpOnly, sameSite, expiry FROM moz_cookies"
            params = []
            if domain_filter:
                query += " WHERE host LIKE ?"
                params.append(f"%{domain_filter}%")

            cursor.execute(query, params)
            rows = cursor.fetchall()
            conn.close()

            results = []
            for host, name, path, val, is_secure, is_httponly, same_site, expiry in rows:
                same_site_str = "Strict" if same_site == 2 else "Lax" if same_site == 1 else "unspecified"
                results.append({
                    "domain": host,
                    "name": name,
                    "path": path,
                    "value": val,
                    "secure": bool(is_secure),
                    "httpOnly": bool(is_httponly),
                    "sameSite": same_site_str,
                    "expirationDate": expiry
                })
            return results
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)
