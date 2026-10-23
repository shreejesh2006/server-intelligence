"""
Predictive Alert Scheduler

Provides a non-blocking background task runner for periodic predictive alert evaluations.
Ensures single-instance execution (no duplicate scheduler tasks).
"""

import asyncio
import logging
import os
from app.database.database import SessionLocal
from app.services.predictive_alerts import evaluate_predictive_alerts

logger = logging.getLogger(__name__)

# Configurable evaluation interval in seconds (default: 60s)
PREDICTIVE_EVAL_INTERVAL_SECONDS = float(os.getenv("PREDICTIVE_EVAL_INTERVAL_SECONDS", "60.0"))


class PredictiveScheduler:
    def __init__(self):
        self._task: asyncio.Task | None = None
        self._running: bool = False

    @property
    def is_running(self) -> bool:
        if self._task is not None:
            return self._running and not self._task.done()
        return self._running

    def start(self) -> bool:
        """
        Starts the background predictive evaluation worker if not already running.
        Returns True if started, False if already active.
        """
        if self.is_running:
            logger.info("Predictive alert scheduler is already active, ignoring duplicate start.")
            return False

        self._running = True
        try:
            loop = asyncio.get_running_loop()
            self._task = loop.create_task(self._run_loop(), name="predictive_alert_scheduler")
        except RuntimeError:
            # Fallback when called synchronously outside an active event loop (e.g. in test setup)
            self._task = None

        logger.info(
            "Predictive alert scheduler started (interval: %ds)",
            int(PREDICTIVE_EVAL_INTERVAL_SECONDS),
        )
        return True

    async def astop(self):
        """Stops the scheduler gracefully, awaiting task cancellation."""
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            logger.info("Predictive alert scheduler stopped gracefully.")

    def stop(self):
        """Stops the scheduler synchronously."""
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            logger.info("Predictive alert scheduler stopped.")

    async def _run_loop(self):
        # Initial small delay to let database and ML loader settle
        await asyncio.sleep(5.0)

        while self._running:
            try:
                db = SessionLocal()
                try:
                    await evaluate_predictive_alerts(db=db)
                finally:
                    db.close()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Error in predictive alert scheduler cycle: %s", exc)

            try:
                await asyncio.sleep(PREDICTIVE_EVAL_INTERVAL_SECONDS)
            except asyncio.CancelledError:
                break


predictive_scheduler = PredictiveScheduler()
