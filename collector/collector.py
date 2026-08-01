import json
import time

from metrics import SystemMetrics
from publisher import VictoriaMetricsPublisher


COLLECTION_INTERVAL_SECONDS = 30


def seconds_until_next_interval(interval):
    """
    Return seconds until the next wall-clock-aligned boundary.

    For 30-second collection:

        HH:MM:00
        HH:MM:30
    """

    now = time.time()

    next_boundary = (
        (int(now) // interval) + 1
    ) * interval

    return max(0.0, next_boundary - now)


def main():
    metrics = SystemMetrics()
    publisher = VictoriaMetricsPublisher()

    print(
        "Server Intelligence collector started "
        f"(interval={COLLECTION_INTERVAL_SECONDS}s)",
        flush=True,
    )

    print(
        "VictoriaMetrics publisher enabled",
        flush=True,
    )

    try:
        while True:

            # Independently synchronize every collection cycle
            # to the next wall-clock boundary.
            sleep_duration = seconds_until_next_interval(
                COLLECTION_INTERVAL_SECONDS
            )

            time.sleep(sleep_duration)

            try:
                sample = metrics.collect()

                publisher.publish(sample)

                print(
                    json.dumps(sample),
                    flush=True,
                )

                print(
                    "Published to VictoriaMetrics",
                    flush=True,
                )

            except Exception as exc:
                print(
                    f"Collection/publish error: {exc}",
                    flush=True,
                )

    except KeyboardInterrupt:
        print(
            "\nCollector stopped.",
            flush=True,
        )


if __name__ == "__main__":
    main()
