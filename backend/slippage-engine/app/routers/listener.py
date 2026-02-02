from fastapi import APIRouter

from app.config import config
from app.schemas import Role1TestResponse
from app.services.listener_client import ListenerClient


router = APIRouter(prefix="/api")


@router.get("/test-role1", response_model=Role1TestResponse)
async def test_role1() -> Role1TestResponse:
    client = ListenerClient()
    try:
        health = await client.health()
        return Role1TestResponse(
            success=True,
            role1_health=health,
            message="Successfully connected to Role 1",
        )
    except Exception as exc:
        return Role1TestResponse(
            success=False,
            error=str(exc),
            listener_url=config.LISTENER_URL,
            suggestion="Check if Role 1's service is running",
        )
