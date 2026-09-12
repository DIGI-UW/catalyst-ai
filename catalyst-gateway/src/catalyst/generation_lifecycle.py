"""Lifetime of one interactive generation, including every model repair/review."""

from __future__ import annotations

import asyncio
from collections.abc import Coroutine
from typing import Any

from fastapi import Request


class GenerationCancelled(asyncio.CancelledError):
    """Keep completed and interrupted role evidence while cancellation unwinds."""

    def __init__(self, cause: asyncio.CancelledError, outcome: dict[str, Any]):
        super().__init__(*cause.args)
        self.evidence = outcome.get("_hubEvidence") or {}


def cancellation_details(error: asyncio.CancelledError) -> tuple[str, str]:
    return "generation_cancelled", "Question preparation stopped."


async def run_generation(request: Request, operation: Coroutine[Any, Any, Any]) -> Any:
    """After consuming the body, race work against an explicit disconnect."""

    async def disconnected() -> None:
        while (await request.receive())["type"] != "http.disconnect":
            pass

    work = asyncio.create_task(operation)
    disconnect = asyncio.create_task(disconnected())
    try:
        done, _ = await asyncio.wait(
            {work, disconnect},
            return_when=asyncio.FIRST_COMPLETED,
        )
        if work in done:
            return await work
        if disconnect in done:
            await disconnect
        work.cancel("generation_cancelled")
        try:
            await work
        except asyncio.CancelledError:
            pass
        raise asyncio.CancelledError("generation_cancelled")
    finally:
        # Also join the child tasks when the ASGI server cancels this handler.
        work.cancel()
        disconnect.cancel()
        await asyncio.gather(work, disconnect, return_exceptions=True)
