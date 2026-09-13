import json
import time

from batcher import TelemetryBatcher
from config import config
from metrics import SystemMetrics
from publisher import MacTelemetryPublisher, VictoriaMetricsPublisher
from spool import SpoolManager


def seconds_until_next_interval(interval):
    """
    Return seconds until the next wall-clock-aligned boundary.
    For 30-second collection: HH:MM:00, HH:MM:30.
    """
    now = time.time()
    next_boundary = ((int(now) // interval) + 1) * interval
    return max(0.0, next_boundary - now)


def main():
    metrics = SystemMetrics()
    batcher = TelemetryBatcher(batch_size=config.batch_size)
    mac_publisher = MacTelemetryPublisher()
    local_publisher = VictoriaMetricsPublisher() if config.enable_local_publish else None
    spool_manager = SpoolManager()

    print(
        "=== SERVER INTELLIGENCE TELEMETRY COLLECTOR STARTED ===",
        flush=True,
    )
    print(
        f"Collection Interval : {config.collection_interval_seconds}s (wall-clock aligned)",
        flush=True,
    )
    print(
        f"Batch Size          : {config.batch_size} samples ({config.batch_size * config.collection_interval_seconds / 60:.1f} minutes)",
        flush=True,
    )
    print(
        f"Mac Receiver URL    : {config.mac_receiver_url}",
        flush=True,
    )
    print(
        f"Auth Token Set      : {'Yes' if config.telemetry_secret_token else 'No'}",
        flush=True,
    )
    print(
        f"Local Publish Mode  : {'Enabled' if config.enable_local_publish else 'Disabled'}",
        flush=True,
    )
    print(
        f"Spool Directory     : {config.spool_dir} (Max files: {config.max_spool_files})",
        flush=True,
    )

    try:
        while True:
            # Synchronize to wall-clock boundary
            sleep_duration = seconds_until_next_interval(config.collection_interval_seconds)
            time.sleep(sleep_duration)

            try:
                sample = metrics.collect()

                print(
                    f"[COLLECT] Sample collected for host '{sample['hostname']}' at {sample['timestamp']}",
                    flush=True,
                )

                # Optional local publishing for migration / local dev testing
                if local_publisher:
                    try:
                        local_publisher.publish(sample)
                        print("[LOCAL VM] Sample published to local VictoriaMetrics", flush=True)
                    except Exception as exc:
                        print(f"[LOCAL VM ERROR] Failed local publish: {exc}", flush=True)

                # Accumulate sample into batch
                batch = batcher.add(sample)

                if batch:
                    print(
                        f"[BATCH] Created batch (v{batch['version']}) with {batch['sample_count']} samples "
                        f"range: {batch['start']} -> {batch['end']}",
                        flush=True,
                    )

                    # First, attempt to flush any previously spooled batches in FIFO order
                    def upload_spooled_batch(spooled_dict, spooled_bytes):
                        return mac_publisher.publish_batch(spooled_dict, spooled_bytes)

                    spool_manager.flush(upload_spooled_batch)

                    # Compress current batch
                    compressed_bytes = TelemetryBatcher.compress(batch)
                    batch_bytes_len = len(compressed_bytes)

                    print(
                        f"[UPLOAD] Transmitting compressed batch ({batch_bytes_len} bytes) to Mac receiver...",
                        flush=True,
                    )

                    try:
                        mac_publisher.publish_batch(batch, compressed_bytes)
                        print(
                            f"[UPLOAD SUCCESS] Batch ({batch['sample_count']} samples) successfully ingested by Mac receiver.",
                            flush=True,
                        )
                    except Exception as exc:
                        print(
                            f"[UPLOAD FAILURE] Network/Receiver error: {exc}",
                            flush=True,
                        )
                        # Spool batch locally for retry
                        spool_manager.spool(batch, compressed_bytes)

            except Exception as exc:
                print(
                    f"[COLLECTOR ERROR] Error in collection cycle: {exc}",
                    flush=True,
                )

    except KeyboardInterrupt:
        print("\nCollector stopped by user.", flush=True)


if __name__ == "__main__":
    main()
