import asyncio
from app.schemas.agent_models import AgentActRequest, UserProfile
from app.services.agent_orchestrator import run_agent_act

async def main():
    req = AgentActRequest(
        image_base64="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        image_context="test image",
        user_action="clicked_image",
        transcription="",
        profile=UserProfile()
    )
    resp = await run_agent_act(req)
    print(resp.json(indent=2))

asyncio.run(main())
