import json
import time

from metrics import SystemMetrics


COLLECTION_INTERVAL_SECONDS = 30


def main():
    metrics = SystemMetrics()

    print(
        f"Server Intelligence collector started "
        f"(interval={COLLECTION_INTERVAL_SECONDS}s)"
    )

    while True:
        try:
            sample = metrics.collect()

            print(
                json.dumps(
                    sample,
                    indent=2
                )
            )

            time.sleep(COLLECTION_INTERVAL_SECONDS)

        except KeyboardInterrupt:
            print("\nCollector stopped.")
            break

        except Exception as exc:
            print(f"Collector error: {exc}")
            time.sleep(COLLECTION_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
