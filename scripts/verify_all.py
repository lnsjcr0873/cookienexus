#!/usr/bin/env python3
"""
CookieNexus: End-to-End Automated Verification Suite
Runs full acceptance test matrix across Server Hub, CRDT Engine, E2EE Cryptography,
Probing & Self-Healing, Python SDK, TypeScript SDK, and Native Extractor.
"""

import sys
import os
import time
import json
import subprocess
import threading
import urllib.request
import urllib.error

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.join(ROOT_DIR, 'packages', 'sdk-python'))

from cookienexus.crypto import CryptoEngine
from cookienexus.client import CookieNexusClient
from cookienexus.pool import CookiePool

def print_header(title: str):
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70)

def print_step(step_id: str, name: str, passed: bool, detail: str = ""):
    symbol = " [PASS]" if passed else "X [FAIL]"
    print(f"{symbol} [{step_id}] {name} {('- ' + detail) if detail else ''}")

def run_node_tests():
    print_header("Phase 1: Server Hub & TS SDK Unit Tests")
    res1 = subprocess.run(["node", os.path.join(ROOT_DIR, "packages", "server", "dist", "tests", "run_tests.js")], capture_output=True, text=True)
    passed1 = res1.returncode == 0
    print_step("TC-01..05", "Server Hub (CRDT, Crypto, Prober)", passed1)
    if not passed1:
        print("Server Test Output:", res1.stdout, res1.stderr)

    res2 = subprocess.run(["node", os.path.join(ROOT_DIR, "packages", "sdk-ts", "dist", "tests", "sdk.test.js")], capture_output=True, text=True)
    passed2 = res2.returncode == 0
    print_step("TC-11", "TypeScript SDK Core & Pool", passed2)
    return passed1 and passed2

def run_python_sdk_tests():
    print_header("Phase 2: Python SDK Unit Tests")
    res = subprocess.run(["python", os.path.join(ROOT_DIR, "packages", "sdk-python", "tests", "test_sdk.py")], capture_output=True, text=True)
    passed = res.returncode == 0
    print_step("TC-10", "Python SDK Cryptography & Session Pool", passed)
    return passed

def run_e2e_integration_test():
    print_header("Phase 3: Live End-to-End E2EE Sync & Probing")
    # Start CookieNexus Hub in background subprocess
    server_process = subprocess.Popen(
        ["node", os.path.join(ROOT_DIR, "packages", "server", "dist", "index.js")],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )

    try:
        # Wait for hub to become healthy
        hub_ready = False
        for _ in range(20):
            try:
                with urllib.request.urlopen("http://127.0.0.1:8765/health", timeout=1) as resp:
                    if resp.status == 200:
                        hub_ready = True
                        break
            except Exception:
                time.sleep(0.2)

        if not hub_ready:
            print_step("TC-E2E-01", "Hub Health Check Startup", False, "Server failed to respond on port 8765")
            return False

        print_step("TC-E2E-01", "Hub Health Check Startup", True, "Listening on http://127.0.0.1:8765")

        # Test Zero-Knowledge Push and Pull with Python SDK
        client = CookieNexusClient(
            hub_url="http://127.0.0.1:8765",
            vault_id="integration_test_vault",
            password="E2EE_Integration_Password_2026"
        )

        test_cookies = [
            {"domain": "github.com", "name": "user_session", "value": "gh_secret_e2e_token_999", "secure": True, "httpOnly": True},
            {"domain": "api.openai.com", "name": "sess_key", "value": "sk-mock-12345", "secure": True, "httpOnly": False}
        ]

        # 1. Push encrypted cookies
        client.push_cookies(test_cookies)
        print_step("TC-03", "Zero-Knowledge Encrypted Push", True, "Encrypted payload pushed to /api/v1/vault")

        # 2. Inspect raw server vault (Verify zero plaintext stored)
        raw_req = urllib.request.Request("http://127.0.0.1:8765/api/v1/vault/integration_test_vault")
        with urllib.request.urlopen(raw_req) as resp:
            raw_vault = json.loads(resp.read().decode('utf-8'))

        has_no_plaintext = ("gh_secret_e2e_token_999" not in json.dumps(raw_vault)) and ("ciphertext" in raw_vault)
        print_step("TC-03-B", "Server Zero-Knowledge Audit", has_no_plaintext, "Server stores pure AES-256-GCM ciphertext")

        # 3. Pull and decrypt with correct password
        decrypted_cookies = client.get_cookies("github.com")
        pull_ok = len(decrypted_cookies) == 1 and decrypted_cookies[0]["value"] == "gh_secret_e2e_token_999"
        print_step("TC-03-C", "Client E2EE Decrypt & Filter", pull_ok, f"Decrypted domain 'github.com': {len(decrypted_cookies)} cookie")

        # 4. Header, Playwright, and cURL format generation
        header_str = client.get_cookie_header("github.com")
        header_ok = header_str == "user_session=gh_secret_e2e_token_999"
        print_step("TC-02", "Format Exporter: HTTP Header", header_ok, f"Output: '{header_str}'")

        curl_cmd = client.get_curl_command("github.com", url="https://api.github.com/user")
        curl_ok = 'curl -b "user_session=gh_secret_e2e_token_999"' in curl_cmd and "https://api.github.com/user" in curl_cmd
        print_step("TC-02-B", "Format Exporter: cURL Command", curl_ok, f"Output: '{curl_cmd}'")

        pw_state = client.get_playwright_storage_state("github.com")
        pw_ok = len(pw_state["cookies"]) == 1 and pw_state["cookies"][0]["name"] == "user_session"
        print_step("TC-10-B", "Format Exporter: Playwright storageState", pw_ok, "Valid storageState schema generated")

        # 5. Probe Lifecycle API Check
        probe_def = {
            "probeId": "e2e_github_health",
            "vaultId": "integration_test_vault",
            "domain": "github.com",
            "request": {
                "url": "http://127.0.0.1:8765/health",
                "method": "GET",
                "timeoutMs": 3000
            },
            "assertion": {
                "expectedStatus": 200,
                "mustContain": ["status", "OK"]
            },
            "scheduleMs": 30000
        }
        reg_res = client.register_probe(probe_def)
        probes_list = client.list_probes()
        probe_reg_ok = any(p.get("probeId") == "e2e_github_health" for p in probes_list)
        print_step("TC-05-A", "Session Probe Registration & Discovery", probe_reg_ok, f"Active Probes: {len(probes_list)}")

        check_res = client.check_probe("e2e_github_health")
        check_ok = check_res.get("lastStatus") == "HEALTHY" and check_res.get("lastLatencyMs") is not None
        print_step("TC-05-B", "Session Probe Immediate Execution", check_ok, f"Status: {check_res.get('lastStatus')} (Latency: {check_res.get('lastLatencyMs')}ms)")

        del_probe_ok = client.delete_probe("e2e_github_health")
        probes_after_del = client.list_probes()
        probe_del_ok = del_probe_ok and not any(p.get("probeId") == "e2e_github_health" for p in probes_after_del)
        print_step("TC-05-C", "Session Probe Teardown", probe_del_ok, "Probe unregistered and purged")

        # 6. Audit Log Masking check via SDK
        audit_logs = client.get_audit_logs(50)
        logs_ok = len(audit_logs) > 0 and not any("gh_secret_e2e_token_999" in json.dumps(l) for l in audit_logs)
        print_step("TC-13", "Audit Log Stream Masking", logs_ok, f"{len(audit_logs)} audit entries verified zero plaintext leaks")

        # 7. CLI Subcommands End-to-End Verification
        cli_res = subprocess.run(
            ["python", os.path.join(ROOT_DIR, "packages", "cli", "cookienexus.py"), "pull",
             "--hub", "http://127.0.0.1:8765", "--vault", "integration_test_vault",
             "--password", "E2EE_Integration_Password_2026", "--format", "curl"],
            capture_output=True, text=True, encoding="utf-8"
        )
        cli_ok = cli_res.returncode == 0 and "curl -b" in cli_res.stdout
        print_step("TC-CLI-01", "Unified CLI Command Execution", cli_ok, "cookienexus pull --format curl executed successfully")

        # 8. List and Delete Vault Lifecycle check
        vaults = client.list_vaults()
        list_ok = "integration_test_vault" in vaults
        print_step("TC-04", "Vault Discovery & Listing API", list_ok, f"Active vaults: {vaults}")

        del_ok = client.delete_vault()
        post_del_vaults = client.list_vaults()
        del_verified = del_ok and ("integration_test_vault" not in post_del_vaults)
        print_step("TC-04-B", "Vault Deletion & Teardown API", del_verified, "Vault successfully purged from Hub")

        return hub_ready and has_no_plaintext and pull_ok and header_ok and curl_ok and pw_ok and probe_reg_ok and check_ok and probe_del_ok and logs_ok and cli_ok and list_ok and del_verified
    finally:
        server_process.terminate()
        server_process.wait()

def main():
    print_header("CookieNexus Automated System Acceptance Suite (v1.0.0)")
    t0 = time.time()

    ok1 = run_node_tests()
    ok2 = run_python_sdk_tests()
    ok3 = run_e2e_integration_test()

    total_time = round(time.time() - t0, 3)
    print_header(f"Acceptance Test Execution Summary (Time: {total_time}s)")

    if ok1 and ok2 and ok3:
        print(" [SUCCESS] ALL 13 ACCEPTANCE TEST SUITES PASSED WITH 100% SUCCESS RATE!")
        print("=" * 70 + "\n")
        return 0
    else:
        print(" [FAILED] SOME TEST CASES FAILED. Please review output above.")
        print("=" * 70 + "\n")
        return 1

if __name__ == '__main__':
    sys.exit(main())
