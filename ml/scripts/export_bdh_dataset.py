"""
BDH Dataset Exporter CLI — Generates Standardized Telemetry Sequence Datasets [N, T, 14]
"""

import sys
import argparse
import logging
from pathlib import Path

# Ensure repository root is on sys.path
REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ml.bdh.config import CANONICAL_HOST, FEATURE_COLUMNS, validate_host
from ml.bdh.fetcher import fetch_ubuntu_telemetry_history
from ml.bdh.dataset import BDHSequenceDataset

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("export_bdh_dataset")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Export standardized BDH telemetry sequence datasets [N, T, 14] for Ubuntu server."
    )
    parser.add_argument(
        "--host",
        type=str,
        default=CANONICAL_HOST,
        help=f"Monitored target host identifier (Default: '{CANONICAL_HOST}'). Only '{CANONICAL_HOST}' is supported.",
    )
    parser.add_argument(
        "--sequence-length",
        "-t",
        type=int,
        default=60,
        help="Sequence window length T in steps (Default: 60, i.e. 30 minutes at 30s step).",
    )
    parser.add_argument(
        "--lookback-days",
        "--lookback",
        type=int,
        default=7,
        help="Lookback window in days (Default: 7).",
    )
    parser.add_argument(
        "--stride",
        type=int,
        default=1,
        help="Sliding window stride in steps (Default: 1).",
    )
    parser.add_argument(
        "--output",
        "-o",
        type=str,
        default=None,
        help="Output file path (.npz). Default: 'ml/data/bdh_datasets/ubuntu_seq<T>.npz'.",
    )
    parser.add_argument(
        "--vm-url",
        type=str,
        default="http://localhost:8428",
        help="VictoriaMetrics base URL (Default: 'http://localhost:8428').",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    # 1. Host Validation
    try:
        canonical_host = validate_host(args.host)
    except ValueError as err:
        logger.error("Host validation failure: %s", err)
        sys.exit(1)

    if args.sequence_length <= 0:
        logger.error("Sequence length must be a positive integer, got %d", args.sequence_length)
        sys.exit(1)

    output_path = args.output
    if not output_path:
        output_path = REPO_ROOT / "ml" / "data" / "bdh_datasets" / f"{canonical_host}_seq{args.sequence_length}.npz"
    else:
        output_path = Path(output_path)

    print("==================================================")
    print("STARTING BDH TELEMETRY DATASET EXPORT PIPELINE")
    print("==================================================")
    print(f"Host Target     : {canonical_host}")
    print(f"Sequence Length : T = {args.sequence_length} steps ({args.sequence_length * 30 / 60:.1f} minutes)")
    print(f"Lookback Window : {args.lookback_days} days")
    print(f"Window Stride   : {args.stride} step(s)")
    print(f"Features (D=14) : {FEATURE_COLUMNS}")
    print(f"Output File     : {output_path}")
    print("==================================================")

    # 2. Fetch Telemetry History
    logger.info("Fetching telemetry history for host '%s'...", canonical_host)
    df_telemetry = fetch_ubuntu_telemetry_history(
        host=canonical_host,
        lookback_days=args.lookback_days,
        vm_url=args.vm_url,
    )

    if df_telemetry.empty or len(df_telemetry) < args.sequence_length:
        logger.error(
            "Insufficient telemetry data found for host '%s' (found %d rows, required >= %d). Export aborted.",
            canonical_host,
            len(df_telemetry),
            args.sequence_length,
        )
        sys.exit(1)

    logger.info("Retrieved %d total telemetry samples for host '%s'.", len(df_telemetry), canonical_host)

    # 3. Build BDH Sequence Dataset
    dataset = BDHSequenceDataset(
        host=canonical_host,
        sequence_length=args.sequence_length,
        stride=args.stride,
    )

    dataset.build_from_dataframe(df_telemetry, fit_preprocessor=True)

    if dataset.X_raw is None or dataset.X_raw.shape[0] == 0:
        logger.error("No valid sequence windows could be constructed from telemetry. Check max gap thresholds.")
        sys.exit(1)

    # 4. Save to .npz Archive
    saved_path = dataset.save_npz(output_path)

    file_size_mb = saved_path.stat().st_size / (1024 * 1024)

    print("==================================================")
    print("BDH TELEMETRY DATASET EXPORT COMPLETE")
    print("==================================================")
    print(f"Export Path     : {saved_path}")
    print(f"File Size       : {file_size_mb:.2f} MB")
    print(f"Raw Tensor X    : shape {dataset.X_raw.shape} (dtype: {dataset.X_raw.dtype})")
    print(f"Norm Tensor X   : shape {dataset.X_normalized.shape} (dtype: {dataset.X_normalized.dtype})")
    print(f"Timestamps      : shape {dataset.timestamps.shape}")
    print(f"Validity Mask   : shape {dataset.validity_mask.shape} (valid steps: {dataset.validity_mask.sum()})")
    print(f"Target Metrics  : {list(dataset.targets.keys()) if dataset.targets else None}")
    print("==================================================")


if __name__ == "__main__":
    main()
