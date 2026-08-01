import json
import time

from metrics import SystemMetrics


COLLECTION_INTERVAL_SECONDS = 30


def seconds_until_next_interval(interval):
    """
    Calculate the number of seconds until the next aligned
    collection boundary.

    For a 30-second interval, samples occur approximately at:

        HH:MM:00
        HH:MM:30
    """

    now = time.time()
    next_boundary = (
        (int(now) // interval) + 1
    ) * interval

    return max(0, next_boundary - now)


def main():
    metrics = SystemMetrics()

    print(
        "Server Intelligence collector started "
        f"(interval={COLLECTION_INTERVAL_SECONDS}s)"
    )

    print("Waiting for next collection boundary...")

    try:
        time.sleep(
            seconds_until_next_interval(
                COLLECTION_INTERVAL_SECONDS
            )
        )

        while True:
            cycle_start = time.monotonic()

            sample = metrics.collect()

            print(
                json.dumps(
                    sample,
                    indent=2
                ),
                flush=True
            )

            collection_duration = (
                time.monotonic() - cycle_start
            )

            sleep_duration = (
                COLLECTION_INTERVAL_SECONDS
                - collection_duration
            )

            if sleep_duration > 0:
                time.sleep(sleep_duration)

    except KeyboardInterrupt:
        print("\nCollector stopped.")


if __name__ == "__main__":
    main()
