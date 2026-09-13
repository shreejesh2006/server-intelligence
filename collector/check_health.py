import json
import sys
import urllib.error
import urllib.request
from config import config


def check_health():
    receiver_url = config.mac_receiver_url
    base_url = receiver_url.rsplit("/api/v1/telemetry", 1)[0]
    health_url = f"{base_url}/api/v1/telemetry/health"

    print("=== TELEMETRY PIPELINE HEALTH CHECK ===")
    print(f"Target Receiver Health URL: {health_url}")
    print(f"Auth Token Configured     : {'Yes' if config.telemetry_secret_token else 'No'}")

    req = urllib.request.Request(health_url, method="GET")
    if config.telemetry_secret_token:
        req.add_header("Authorization", f"Bearer {config.telemetry_secret_token}")

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            status_code = response.status
            body_text = response.read().decode("utf-8")
            data = json.loads(body_text)

            print("\n[RESULT] Health Check Response:")
            print(json.dumps(data, indent=2))

            if status_code == 200 and data.get("status") == "healthy" and data.get("victoriametrics_status") == "healthy":
                print("\n✅ End-to-end status HEALTHY: Ubuntu Collector → Mac Receiver → Mac VictoriaMetrics")
                return True
            else:
                print("\n⚠️ Pipeline reported DEGRADED status.")
                return False

    except urllib.error.HTTPError as exc:
        print(f"\n❌ HTTP Error {exc.code}: {exc.read().decode('utf-8', errors='ignore')}")
        return False
    except urllib.error.URLError as exc:
        print(f"\n❌ Network Error: Could not reach Mac receiver at {health_url}: {exc.reason}")
        return False
    except Exception as exc:
        print(f"\n❌ Unexpected Error: {exc}")
        return False


if __name__ == "__main__":
    success = check_health()
    sys.exit(0 if success else 1)
