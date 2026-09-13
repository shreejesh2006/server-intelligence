import gzip
import json
from datetime import datetime, timezone
from config import config


class TelemetryBatcher:
    def __init__(self, batch_size=None):
        self.batch_size = batch_size or config.batch_size
        self.samples = []

    def add(self, sample):
        self.samples.append(sample)

        if len(self.samples) >= self.batch_size:
            batch = self.samples
            self.samples = []
            return self.create_batch(batch)

        return None

    def create_batch(self, samples):
        return {
            "version": "1.0",
            "hostname": samples[0]["hostname"],
            "start": samples[0]["timestamp"],
            "end": samples[-1]["timestamp"],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "sample_count": len(samples),
            "samples": samples,
        }

    @staticmethod
    def compress(batch):
        payload = json.dumps(
            batch,
            separators=(",", ":")
        ).encode("utf-8")

        return gzip.compress(payload)
