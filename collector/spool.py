import gzip
import json
import os
import time
import uuid
from config import config


class SpoolManager:
    def __init__(self, spool_dir=None, max_files=None):
        self.spool_dir = spool_dir or config.spool_dir
        self.max_files = max_files or config.max_spool_files
        os.makedirs(self.spool_dir, exist_ok=True)

    def get_spooled_files(self):
        """Returns sorted list of absolute file paths in spool directory (oldest first)."""
        if not os.path.exists(self.spool_dir):
            return []
        files = [
            os.path.join(self.spool_dir, f)
            for f in os.listdir(self.spool_dir)
            if f.startswith("batch_") and f.endswith(".json.gz")
        ]
        return sorted(files)

    def spool(self, batch_dict, compressed_bytes=None):
        """Saves a failed batch payload to disk as a gzip file."""
        os.makedirs(self.spool_dir, exist_ok=True)

        if compressed_bytes is None:
            payload = json.dumps(batch_dict, separators=(",", ":")).encode("utf-8")
            compressed_bytes = gzip.compress(payload)

        ts_ms = int(time.time() * 1000)
        unique_id = uuid.uuid4().hex[:8]
        filename = f"batch_{ts_ms}_{unique_id}.json.gz"
        filepath = os.path.join(self.spool_dir, filename)

        try:
            with open(filepath, "wb") as f:
                f.write(compressed_bytes)

            print(
                f"[SPOOL] Spooled failed batch to {filepath} "
                f"(spooled total: {len(self.get_spooled_files())}/{self.max_files})",
                flush=True,
            )
        except Exception as exc:
            print(f"[SPOOL ERROR] Failed to write batch to spool file: {exc}", flush=True)

        self.enforce_bounds()

    def enforce_bounds(self):
        """Prunes oldest spooled files if total exceeds max_files limit."""
        spooled = self.get_spooled_files()
        if len(spooled) > self.max_files:
            excess = len(spooled) - self.max_files
            print(f"[SPOOL WARNING] Spool limit exceeded ({self.max_files}). Pruning {excess} oldest file(s)...", flush=True)
            for filepath in spooled[:excess]:
                try:
                    os.remove(filepath)
                    print(f"[SPOOL PRUNE] Removed {filepath}", flush=True)
                except Exception as exc:
                    print(f"[SPOOL ERROR] Failed to remove pruned file {filepath}: {exc}", flush=True)

    def flush(self, upload_fn):
        """
        Attempts to upload spooled files in FIFO order.
        Stops on the first failure to maintain chronological sequence.
        """
        spooled = self.get_spooled_files()
        if not spooled:
            return 0

        print(f"[RETRY] Attempting to flush {len(spooled)} spooled batch(es)...", flush=True)
        flushed_count = 0

        for filepath in spooled:
            try:
                with open(filepath, "rb") as f:
                    compressed_bytes = f.read()

                # Decompress to extract batch metadata for logging
                decompressed = gzip.decompress(compressed_bytes)
                batch_dict = json.loads(decompressed.decode("utf-8"))

                print(f"[RETRY] Uploading spooled file {os.path.basename(filepath)}...", flush=True)
                success = upload_fn(batch_dict, compressed_bytes)

                if success:
                    os.remove(filepath)
                    flushed_count += 1
                    print(f"[RETRY SUCCESS] Flushed {os.path.basename(filepath)}", flush=True)
                else:
                    print(f"[RETRY FAILURE] Failed to upload {os.path.basename(filepath)}. Stopping flush loop.", flush=True)
                    break
            except Exception as exc:
                print(f"[RETRY ERROR] Error processing spool file {filepath}: {exc}. Stopping flush loop.", flush=True)
                break

        remaining = len(self.get_spooled_files())
        print(f"[SPOOL STATUS] Flush cycle complete. Flushed: {flushed_count}, Remaining: {remaining}", flush=True)
        return flushed_count
