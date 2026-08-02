import os

import httpx


VICTORIAMETRICS_URL = os.getenv(
    "VICTORIAMETRICS_URL",
    "http://localhost:8428",
)


class VictoriaMetricsService:
    def __init__(self, base_url: str = VICTORIAMETRICS_URL):
        self.base_url = base_url.rstrip("/")

    async def query(self, query: str):
        url = f"{self.base_url}/api/v1/query"

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                url,
                params={"query": query},
            )

            response.raise_for_status()

            payload = response.json()

        if payload.get("status") != "success":
            raise RuntimeError(
                "VictoriaMetrics query was unsuccessful"
            )

        return payload["data"]["result"]

    async def query_range(
        self,
        query: str,
        start: str,
        end: str,
        step: str = "30s",
    ):
        url = f"{self.base_url}/api/v1/query_range"

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                url,
                params={
                    "query": query,
                    "start": start,
                    "end": end,
                    "step": step,
                },
            )

            response.raise_for_status()

            payload = response.json()

        if payload.get("status") != "success":
            raise RuntimeError(
                "VictoriaMetrics range query was unsuccessful"
            )

        return payload["data"]["result"]
