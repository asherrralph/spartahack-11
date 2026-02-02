from typing import Any, Dict, Optional

import httpx

from app.config import config


class ListenerClient:
    def __init__(self, base_url: Optional[str] = None) -> None:
        self.base_url = (base_url or config.LISTENER_URL).rstrip("/")

    async def health(self) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{self.base_url}/health")
            response.raise_for_status()
            return response.json()

    async def list_pairs(self) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{self.base_url}/api/pairs")
            response.raise_for_status()
            return response.json()

    async def pair_stats(self, pair: str) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{self.base_url}/api/pairs/{pair}")
            response.raise_for_status()
            return response.json()
