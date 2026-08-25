import sys
import argparse
import logging
from pathlib import Path

# Add repo root to sys.path
REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ml.training import train_host_models, normalize_host

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


def main():
    parser = argparse.ArgumentParser(description="Production ML Retraining using Real VictoriaMetrics Telemetry")
    parser.add_argument("--host", type=str, required=True, help="Target host name or IP (e.g. ubuntu, kali, 100.108.160.2, all)")
    parser.add_argument("--lookback-days", type=int, default=7, help="Lookback window in days (default: 7)")
    parser.add_argument("--vm-url", type=str, default="http://localhost:8428", help="VictoriaMetrics base URL")

    args = parser.parse_args()

    target_host = args.host.strip()
    if target_host.lower() == "all":
        hosts_to_train = ["ubuntu", "kali"]
    else:
        canonical = normalize_host(target_host)
        if not canonical:
            print(f"Error: Unknown or invalid host specified: '{args.host}'")
            sys.exit(1)
        hosts_to_train = [canonical]

    print("==================================================")
    print("STARTING REAL TELEMETRY RETRAINING PIPELINE")
    print("==================================================")
    print(f"Target Hosts:   {hosts_to_train}")
    print(f"Lookback Days:  {args.lookback_days}")
    print(f"VM Base URL:    {args.vm_url}")
    print("==================================================")

    for h in hosts_to_train:
        try:
            summary = train_host_models(host=h, lookback_days=args.lookback_days, vm_url=args.vm_url)
            print(f"[SUCCESS] Retrained host '{h}': {len(summary['forecast_models'])} forecast models, anomaly={summary['anomaly_trained']}")
        except Exception as exc:
            print(f"[ERROR] Failed retraining host '{h}': {exc}")

    print("==================================================")
    print("RETRAINING PIPELINE COMPLETE")
    print("==================================================")


if __name__ == "__main__":
    main()
