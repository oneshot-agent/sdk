"""OneShotClient — HTTP client with x402 payment flow.

Ports the ``OneShot`` class from ``libs/agent-sdk/src/index.ts``.
Handles: quote -> pay -> poll lifecycle for paid tools, and simple
GET/POST for free endpoints.
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Optional

import httpx
from eth_account import Account

from oneshot._errors import (
    ContentBlockedError,
    JobError,
    JobTimeoutError,
    OneShotError,
    ToolError,
    ValidationError,
)
from oneshot.x402 import sign_payment_authorization

SDK_VERSION = "0.3.0"

# ---------------------------------------------------------------------------
# Environment configuration
# ---------------------------------------------------------------------------

PROD_ENV = {
    "base_url": "https://win.oneshotagent.com",
    "rpc_url": "https://mainnet.base.org",
    "chain_id": 8453,
    "usdc_address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
}

# Deprecated: staging is internal-only. TEST_ENV now aliases to PROD_ENV.
TEST_ENV = PROD_ENV

_POLL_INTERVAL = 2.0  # seconds
_MAX_POLL_RETRIES = 3


class OneShotClient:
    """Synchronous + async HTTP client for the OneShot API.

    Supports the full x402 quote-then-pay lifecycle for paid tools and
    simple requests for free endpoints.
    """

    def __init__(
        self,
        private_key: str,
        *,
        test_mode: bool = False,
        base_url: Optional[str] = None,
        debug: bool = False,
    ) -> None:
        env = TEST_ENV if test_mode else PROD_ENV
        self.base_url = base_url or env["base_url"]
        self.chain_id: int = env["chain_id"]
        self.usdc_address: str = env["usdc_address"]
        self.test_mode = test_mode
        self.debug = debug

        # Derive wallet address from private key
        self._private_key = private_key
        acct = Account.from_key(private_key)
        self.address: str = acct.address

    # ------------------------------------------------------------------
    # Headers
    # ------------------------------------------------------------------

    def _headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "X-Agent-ID": self.address,
            "X-OneShot-SDK-Version": SDK_VERSION,
        }

    def _log(self, msg: str) -> None:
        if self.debug:
            print(f"[OneShot] {msg}")

    # ------------------------------------------------------------------
    # Paid tool flow  (POST -> 402 -> sign -> POST w/ payment -> poll)
    # ------------------------------------------------------------------

    def call_tool(
        self,
        endpoint: str,
        payload: dict[str, Any],
        *,
        max_cost: Optional[float] = None,
        timeout_sec: int = 120,
    ) -> Any:
        """Execute a paid tool call (blocking). Handles the full x402 flow."""
        return asyncio.get_event_loop().run_until_complete(
            self.acall_tool(endpoint, payload, max_cost=max_cost, timeout_sec=timeout_sec)
        )

    async def acall_tool(
        self,
        endpoint: str,
        payload: dict[str, Any],
        *,
        max_cost: Optional[float] = None,
        timeout_sec: int = 120,
    ) -> Any:
        """Execute a paid tool call (async). Handles the full x402 flow."""
        url = f"{self.base_url}{endpoint}"

        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
            # Step 1 — Initial POST (expect 402 for paid tools)
            resp = await client.post(url, headers=self._headers(), json=payload)

            # Handle validation / content-blocked errors
            if resp.status_code == 400:
                data = resp.json()
                err_type = data.get("error", "")
                if err_type == "content_blocked":
                    raise ContentBlockedError(
                        data.get("message", "Content blocked"),
                        data.get("categories", []),
                    )
                raise ValidationError(
                    data.get("message", "Invalid request"), "request"
                )

            # If not 402, this might be a free tool that returned directly
            if resp.status_code != 402:
                resp.raise_for_status()
                result = resp.json()
                # Handle async jobs
                if isinstance(result, dict) and result.get("request_id") and result.get("status") in (
                    "pending",
                    "processing",
                ):
                    return await self._poll_job(client, result["request_id"], timeout_sec)
                return result.get("data", result)

            # Step 2 — Parse 402 response
            quote_data = resp.json()
            payment_request = quote_data["payment_request"]
            context = quote_data.get("context", {})
            quote_id = context.get("quote_id")

            # Check max_cost
            total = context.get("total") or context.get("pricing", {}).get("total")
            if max_cost is not None and total is not None:
                if float(total) > max_cost:
                    raise OneShotError(
                        f"Quote ${total} exceeds max_cost ${max_cost}"
                    )

            self._log(f"Payment required: {payment_request['amount']} USDC")

            # Step 3 — Sign x402 payment
            auth = sign_payment_authorization(
                private_key=self._private_key,
                from_address=self.address,
                to_address=payment_request["recipient"],
                amount=payment_request["amount"],
                token_address=payment_request["token_address"],
                chain_id=payment_request["chain_id"],
                network=f"eip155:{payment_request['chain_id']}",
            )

            # Step 4 — Re-POST with payment headers
            headers = {
                **self._headers(),
                "x-payment": json.dumps(auth),
            }
            if quote_id:
                headers["x-quote-id"] = quote_id

            resp2 = await client.post(url, headers=headers, json=payload)

            if resp2.status_code not in (200, 201, 202):
                raise ToolError(
                    "Tool request failed after payment",
                    resp2.status_code,
                    resp2.text,
                )

            result = resp2.json()

            # Step 5 — Poll if async job
            if isinstance(result, dict) and result.get("request_id") and result.get("status") in (
                "pending",
                "processing",
            ):
                self._log(f"Job queued: {result['request_id']}")
                return await self._poll_job(client, result["request_id"], timeout_sec)

            return result.get("data", result)

    # ------------------------------------------------------------------
    # Free endpoint helpers
    # ------------------------------------------------------------------

    def call_free_get(
        self,
        endpoint: str,
        params: Optional[dict[str, str]] = None,
    ) -> Any:
        """GET a free endpoint (blocking)."""
        return asyncio.get_event_loop().run_until_complete(
            self.acall_free_get(endpoint, params)
        )

    async def acall_free_get(
        self,
        endpoint: str,
        params: Optional[dict[str, str]] = None,
    ) -> Any:
        """GET a free endpoint (async)."""
        url = f"{self.base_url}{endpoint}"
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
            resp = await client.get(url, headers=self._headers(), params=params)
            if not resp.is_success:
                raise ToolError(f"GET {endpoint} failed", resp.status_code, resp.text)
            return resp.json()

    def call_free_post(
        self,
        endpoint: str,
        payload: Optional[dict[str, Any]] = None,
    ) -> Any:
        """POST to a free endpoint (blocking)."""
        return asyncio.get_event_loop().run_until_complete(
            self.acall_free_post(endpoint, payload)
        )

    async def acall_free_post(
        self,
        endpoint: str,
        payload: Optional[dict[str, Any]] = None,
    ) -> Any:
        """POST to a free endpoint (async)."""
        url = f"{self.base_url}{endpoint}"
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
            resp = await client.post(url, headers=self._headers(), json=payload or {})
            if not resp.is_success:
                raise ToolError(f"POST {endpoint} failed", resp.status_code, resp.text)
            return resp.json()

    def call_free_patch(
        self,
        endpoint: str,
        payload: Optional[dict[str, Any]] = None,
    ) -> Any:
        """PATCH a free endpoint (blocking)."""
        return asyncio.get_event_loop().run_until_complete(
            self.acall_free_patch(endpoint, payload)
        )

    async def acall_free_patch(
        self,
        endpoint: str,
        payload: Optional[dict[str, Any]] = None,
    ) -> Any:
        """PATCH a free endpoint (async)."""
        url = f"{self.base_url}{endpoint}"
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
            resp = await client.patch(url, headers=self._headers(), json=payload or {})
            if not resp.is_success:
                raise ToolError(f"PATCH {endpoint} failed", resp.status_code, resp.text)
            # PATCH may return empty body (204)
            if resp.status_code == 204 or not resp.text:
                return {"success": True}
            return resp.json()

    # ------------------------------------------------------------------
    # Job polling
    # ------------------------------------------------------------------

    async def _poll_job(
        self,
        client: httpx.AsyncClient,
        request_id: str,
        timeout_sec: int,
    ) -> Any:
        start = time.monotonic()
        retries = 0

        while (time.monotonic() - start) < timeout_sec:
            try:
                resp = await client.get(
                    f"{self.base_url}/v1/requests/{request_id}",
                    headers=self._headers(),
                )
                if not resp.is_success:
                    raise ToolError(
                        "Failed to check job status",
                        resp.status_code,
                        resp.text,
                    )

                job = resp.json()

                if job.get("status") == "completed":
                    self._log("Job completed")
                    return job.get("result", job)

                if job.get("status") == "failed":
                    raise JobError(
                        f"Job failed: {job.get('error', 'Unknown')}",
                        request_id,
                        str(job.get("error", "Unknown")),
                    )

                retries = 0
                await asyncio.sleep(_POLL_INTERVAL)

            except (OneShotError, JobError):
                raise
            except Exception:
                retries += 1
                if retries > _MAX_POLL_RETRIES:
                    raise
                await asyncio.sleep(_POLL_INTERVAL * (2 ** (retries - 1)))

        elapsed_ms = int((time.monotonic() - start) * 1000)
        raise JobTimeoutError(request_id, elapsed_ms)
