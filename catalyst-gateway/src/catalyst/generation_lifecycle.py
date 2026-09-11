"""Lifetime of one interactive generation, including every model repair/review."""

from __future__ import annotations

import asyncio
from collections.abc import Coroutine
from contextvars import ContextVar
from typing import Any

from fastapi import Request

_DEADLINE: ContextVar[float | None] = ContextVar("generation_deadline", default=None)


class GenerationCancelled(asyncio.CancelledError):
    """Keep completed and interrupted role evidence while cancellation unwinds."""

    def __init__(self, cause: asyncio.CancelledError, outcome: dict[str, Any]):
        super().__init__(*cause.args)
        self.evidence = outcome.get("_hubEvidence") or {}


def cancellation_details(error: asyncio.CancelledError) -> tuple[str, str]:
    if error.args and error.args[0] == "generation_timeout":
        return (
            "generation_timeout",
            "This question took too long to prepare. Please try again.",
        )
    return "generation_cancelled", "Question preparation stopped."


def remaining_generation_seconds(limit: float) -> float:
    deadline = _DEADLINE.get()
    if deadline is None:
        return limit
    remaining = deadline - asyncio.get_running_loop().time()
    if remaining <= 0:
        raise asyncio.CancelledError("generation_timeout")
    return min(limit, remaining)


async def run_generation(
    request: Request, operation: Coroutine[Any, Any, Any], timeout_seconds: float
) -> Any:
    """After consuming the body, race work against disconnect and one deadline."""

    async def disconnected() -> None:
        while (await request.receive())["type"] != "http.disconnect":
            pass

    token = _DEADLINE.set(asyncio.get_running_loop().time() + timeout_seconds)
    work = asyncio.create_task(operation)
    disconnect = asyncio.create_task(disconnected())
    try:
        done, _ = await asyncio.wait(
            {work, disconnect},
            timeout=timeout_seconds,
            return_when=asyncio.FIRST_COMPLETED,
        )
        if work in done:
            return await work
        if disconnect in done:
            await disconnect
        reason = "generation_cancelled" if disconnect in done else "generation_timeout"
        work.cancel(reason)
        try:
            await work
        except asyncio.CancelledError:
            pass
        raise asyncio.CancelledError(reason)
    finally:
        # Also join the child tasks when the ASGI server cancels this handler.
        work.cancel()
        disconnect.cancel()
        await asyncio.gather(work, disconnect, return_exceptions=True)
        _DEADLINE.reset(token)
