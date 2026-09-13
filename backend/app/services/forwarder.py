import gzip
import json
import os
import time
import uuid
import httpx

FORWARD_TELEMETRY_URL = os.getenv("FORWARD_TELEMETRY_URL", os.getenv("RENDER_TELEMETRY_URL", "")).rstrip("/")
TELEMETRY_SECRET_TOKEN = os.getenv("TELEMETRY_SECRET_TOKEN", "")
FORWARD_SPOOL_DIR = os.getenv("FORWARD_SPOOL_DIR", "./forward_spool")
MAX_FORWARD_SPOOL_FILES = int(os.getenv("MAX_FORWARD_SPOOL_FILES", "288"))


class ForwardSpoolManager:
    def __init__(self, spool_dir=None, max_files=None):
        self.spool_dir = spool_dir or FORWARD_SPOOL_DIR
        self.max_files = max_files or MAX_FORWARD_SPOOL_FILES
        os.makedirs(self.spool_dir, exist_ok=True)

    def get_spooled_files(self):
        """Returns sorted list of absolute file paths in forward spool directory (oldest first)."""
        if not os.path.exists(self.spool_dir):
            return []
        files = [
            os.path.join(self.spool_dir, f)
            for f in os.listdir(self.spool_dir)
            if f.startswith("fwd_batch_") and f.endswith(".json.gz")
        ]
        return sorted(files)

    def enqueue(self, compressed_bytes: bytes) -> str | None:
        """Saves a compressed batch to disk queue for forwarding to Render."""
        os.makedirs(self.spool_dir, exist_ok=True)
        ts_ms = int(time.time() * 1000)
        unique_id = uuid.uuid4().hex[:8]
        filename = f"fwd_batch_{ts_ms}_{unique_id}.json.gz"
        filepath = os.path.join(self.spool_dir, filename)

        try:
            with open(filepath, "wb") as f:
                f.write(compressed_bytes)
            print(f"[FORWARD QUEUE] Enqueued batch {filename} (spooled total: {len(self.get_spooled_files())}/{self.max_files})", flush=True)
            self.enforce_bounds()
            return filepath
        except Exception as exc:
            print(f"[FORWARD QUEUE ERROR] Failed to write spool file: {exc}", flush=True)
            return None

    def enforce_bounds(self):
        """Prunes oldest spooled files if count exceeds max_files."""
        spooled = self.get_spooled_files()
        if len(spooled) > self.max_files:
            excess = len(spooled) - self.max_files
            print(f"[FORWARD QUEUE WARNING] Limit exceeded. Pruning {excess} oldest file(s)...", flush=True)
            for filepath in spooled[:excess]:
                try:
                    os.remove(filepath)
                except Exception:
                    pass

    async def flush(self):
        """
        Flushes spooled batches to Render in FIFO order.
        Stops on first failure to maintain chronological order and avoid duplicate out-of-order sends.
        """
        target_url = os.getenv("FORWARD_TELEMETRY_URL", FORWARD_TELEMETRY_URL).rstrip("/")
        if not target_url:
            return 0

        spooled = self.get_spooled_files()
        if not spooled:
            return 0

        secret_token = os.getenv("TELEMETRY_SECRET_TOKEN", TELEMETRY_SECRET_TOKEN)
        headers = {
            "Content-Type": "application/json",
            "Content-Encoding": "gzip",
        }
        if secret_token:
            headers["Authorization"] = f"Bearer {secret_token}"

        flushed_count = 0

        for filepath in spooled:
            try:
                with open(filepath, "rb") as f:
                    compressed_bytes = f.read()

                print(f"[FORWARD RETRY] Sending {os.path.basename(filepath)} to {target_url}...", flush=True)
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.post(
                        target_url,
                        content=compressed_bytes,
                        headers=headers,
                    )

                if resp.status_code in (200, 204):
                    os.remove(filepath)
                    flushed_count += 1
                    print(f"[FORWARD SUCCESS] Flushed {os.path.basename(filepath)} -> HTTP {resp.status_code}", flush=True)
                else:
                    print(
                        f"[FORWARD RETRY PAUSED] {target_url} returned HTTP {resp.status_code}: {resp.text[:100]}. "
                        "Retaining batch for next retry.",
                        flush=True,
                    )
                    break

            except Exception as exc:
                print(
                    f"[FORWARD RETRY PAUSED] Network error contacting {target_url}: {exc}. "
                    "Retaining batch for next retry.",
                    flush=True,
                )
                break

        return flushed_count


forward_spool_manager = ForwardSpoolManager()
