import json
import time

from metrics import SystemMetrics
from publisher import VictoriaMetricsPublisher


COLLECTION_INTERVAL_SECONDS = 30


def seconds_until_next_interval(interval):
    """
    Return the number of seconds until the next
    wall-clock-aligned collection boundary.

    With a 30-second interval:

        HH:MM:00
        HH:MM:30
    """

    now = time.time()

    next_boundary = (
        (int(now) // interval) + 1
    ) * interval

    return max(
        0,
        next_boundary - now
    )


def main():
    metrics = SystemMetrics()
    publisher = VictoriaMetricsPublisher()

    print(
        "Server Intelligence collector started "
        f"(interval={COLLECTION_INTERVAL_SECONDS}s)"
    )

    print(
        "VictoriaMetrics publisher enabled"
    )

    print(
        "Waiting for next collection boundary..."
    )

    try:
        time.sleep(
            seconds_until_next_interval(
                COLLECTION_INTERVAL_SECONDS
            )
        )

        while True:
            cycle_start = time.monotonic()

            try:
                sample = metrics.collect()

                publisher.publish(sample)

                print(
                    json.dumps(
                        sample,
                        indent=2
                    ),
                    flush=True
                )

                print(
                    "Published to VictoriaMetrics",
                    flush=True
                )

            except Exception as exc:
                print(
                    f"Collection/publish error: {exc}",
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
        print(
            "\nCollector stopped."
        )


if __name__ == "__main__":
    main()
