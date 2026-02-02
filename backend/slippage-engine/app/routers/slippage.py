from fastapi import APIRouter, Query

from app.schemas import SlippageResponse
from app.services.listener_client import ListenerClient


router = APIRouter(prefix="/api")


@router.post("/slippage", response_model=SlippageResponse)
async def calculate_slippage(pair: str = Query("WETH-PEPE")) -> SlippageResponse:
    client = ListenerClient()
    role1_snapshot = None
    try:
        role1_snapshot = await client.pair_stats(pair)
    except Exception:
        role1_snapshot = None

    return SlippageResponse(
        pair=pair,
        recommended_slippage=0.008,
        recommended_percent="0.8%",
        risk_level="MODERATE",
        message="This is a placeholder - real calculation coming soon!",
        role1_snapshot=role1_snapshot,
    )
