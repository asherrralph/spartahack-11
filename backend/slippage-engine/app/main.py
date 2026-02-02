from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import config, log_config
from app.routers import health as health_router
from app.routers import listener as listener_router
from app.routers import slippage as slippage_router
from app.services.listener_client import ListenerClient


app = FastAPI(
    title="MEV Weather - Slippage Engine",
    description="Calculates optimal slippage based on real-time bot activity",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router.router)
app.include_router(listener_router.router)
app.include_router(slippage_router.router)


@app.on_event("startup")
async def startup() -> None:
    print("\n╔═══════════════════════════════════════════════════════════╗")
    print("║                                                           ║")
    print("║              MEV WEATHER - SLIPPAGE ENGINE                ║")
    print("║                                                           ║")
    print("╚═══════════════════════════════════════════════════════════╝\n")

    log_config()

    await test_role1_connection()


async def test_role1_connection() -> None:
    print("🔍 Testing connection to Role 1's backend...")
    client = ListenerClient()
    try:
        data = await client.health()
        print("   ✅ Connected to Role 1!")
        print(f"   Role 1 Status: {data.get('status')}")
        print(f"   Role 1 Uptime: {data.get('uptime_seconds')}s")
        print()
    except Exception as exc:
        print(f"   ⚠️  Cannot connect to Role 1: {exc}")
        print(f"   Attempted URL: {config.LISTENER_URL}")
        print("   Make sure:")
        print("   1. Role 1 has their service running ('npm start')")
        print("   2. LISTENER_URL in your .env has correct IP address")
        print(f"   3. You can access it: curl {config.LISTENER_URL}/health")
        print()
