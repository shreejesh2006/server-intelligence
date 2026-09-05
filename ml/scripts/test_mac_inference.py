import sys
import json
import logging
from pathlib import Path

# Add repo root to sys.path
REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ml.mac_inference import MacAnomalyInferenceService, normalize_host

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


def main():
    print("==================================================")
    print("PHASE 2: MAC-SIDE REMOTE TELEMETRY INFERENCE TEST")
    print("==================================================")

    service = MacAnomalyInferenceService()

    # 1. Verify Model Loading & Host Isolation
    print("\n1. VERIFYING LOCAL MODEL ARTIFACT LOADING...")
    ub_det = service.get_detector("ubuntu")
    kali_det = service.get_detector("kali")
    non_det = service.get_detector("nonexistent")

    print("   Ubuntu Detector:", ub_det.model_path if ub_det else "MISSING")
    print("   Kali Detector  :", kali_det.model_path if kali_det else "MISSING")
    print("   Nonexistent Det:", non_det)

    assert ub_det is not None, "Ubuntu detector must be loaded"
    assert kali_det is not None, "Kali detector must be loaded"
    assert non_det is None, "Nonexistent host detector must be None"
    assert ub_det != kali_det, "Ubuntu and Kali detectors must be distinct instances"
    print("[SUCCESS] Host isolation and local model loading verified.")

    # 2. Run Local Inference on Live Telemetry for Ubuntu
    print("\n2. RUNNING MAC INFERENCE FOR HOST 'ubuntu'...")
    ub_result = service.predict_anomaly("ubuntu")
    print(json.dumps(ub_result, indent=2))
    assert ub_result["host"] == "ubuntu"
    assert ub_result["telemetry_status"] == "ok"
    assert len(ub_result["all_metrics_evaluated"]) == 11
    print("[SUCCESS] Mac-side inference for Ubuntu completed successfully.")

    # 3. Run Local Inference on Live Telemetry for Kali
    print("\n3. RUNNING MAC INFERENCE FOR HOST 'kali'...")
    kali_result = service.predict_anomaly("kali")
    print(json.dumps(kali_result, indent=2))
    assert kali_result["host"] == "kali"
    assert kali_result["telemetry_status"] == "ok"
    assert len(kali_result["all_metrics_evaluated"]) == 11
    print("[SUCCESS] Mac-side inference for Kali completed successfully.")

    # 4. Verify Nonexistent Host Clean Failure
    print("\n4. VERIFYING CLEAN FAILURE FOR HOST 'nonexistent'...")
    non_result = service.predict_anomaly("nonexistent")
    print("   Model Status    :", non_result.get("model_status"))
    print("   Telemetry Status:", non_result.get("telemetry_status"))
    assert non_result["model_status"] == "unavailable"
    assert non_result["telemetry_status"] == "model_unavailable"
    print("[SUCCESS] Nonexistent host cleanly returns unavailable state.")

    print("\n==================================================")
    print("ALL PHASE 2 MAC INFERENCE VERIFICATIONS PASSED!")
    print("==================================================")


if __name__ == "__main__":
    main()
