import os


class CollectorConfig:
    def __init__(self):
        self.mac_receiver_url = os.getenv(
            "MAC_RECEIVER_URL",
            "http://localhost:8000/api/v1/telemetry/ingest",
        ).rstrip("/")

        self.telemetry_secret_token = os.getenv(
            "TELEMETRY_SECRET_TOKEN",
            "",
        )

        self.enable_local_publish = (
            os.getenv("ENABLE_LOCAL_PUBLISH", "false").lower() in ("true", "1", "yes")
        )

        self.collection_interval_seconds = int(
            os.getenv("COLLECTION_INTERVAL_SECONDS", "30")
        )

        self.batch_size = int(
            os.getenv("BATCH_SIZE", "10")
        )

        self.spool_dir = os.getenv(
            "SPOOL_DIR",
            "./spool",
        )

        self.max_spool_files = int(
            os.getenv("MAX_SPOOL_FILES", "288")
        )


config = CollectorConfig()
