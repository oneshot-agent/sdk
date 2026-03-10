"""Factory functions that produce GAME `Function` objects for each OneShot tool.

Each factory returns a single ``Function`` whose ``executable`` wraps
``OneShotClient.call_tool`` or ``OneShotClient.call_free_get``.

GAME ``Argument`` only supports scalar types, so complex arguments
(shipping_address, product) are passed as JSON strings and parsed internally.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

from game_sdk.game.custom_types import Argument, Function, FunctionResultStatus

if TYPE_CHECKING:
    from oneshot import OneShotClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ok(msg: str, data: dict | None = None):
    return FunctionResultStatus.DONE, msg, data or {}


def _fail(msg: str):
    return FunctionResultStatus.FAILED, msg, {}


# ---------------------------------------------------------------------------
# 1. Email
# ---------------------------------------------------------------------------

def make_email_function(client: OneShotClient) -> Function:
    def _run(args: dict, logger):
        try:
            result = client.call_tool("/v1/tools/email/send", {
                "to": args["to"],
                "subject": args["subject"],
                "body": args["body"],
                **({"from_domain": args["from_domain"]} if args.get("from_domain") else {}),
            })
            return _ok(f"Email sent to {args['to']}", {"result": result})
        except Exception as e:
            return _fail(f"Email failed: {e}")

    return Function(
        fn_name="oneshot_email",
        fn_description=(
            "Send an email to a real recipient. Costs ~$0.01 USDC. "
            "Provide to (email address), subject, body, and optionally from_domain."
        ),
        args=[
            Argument(name="to", type="string", description="Recipient email address", optional=False),
            Argument(name="subject", type="string", description="Email subject line", optional=False),
            Argument(name="body", type="string", description="Email body text", optional=False),
            Argument(name="from_domain", type="string", description="Custom sender domain (optional)", optional=True),
        ],
        executable=_run,
    )


# ---------------------------------------------------------------------------
# 2. SMS
# ---------------------------------------------------------------------------

def make_sms_function(client: OneShotClient) -> Function:
    def _run(args: dict, logger):
        try:
            result = client.call_tool("/v1/tools/sms/send", {
                "to_number": args["to_number"],
                "message": args["message"],
            })
            return _ok(f"SMS sent to {args['to_number']}", {"result": result})
        except Exception as e:
            return _fail(f"SMS failed: {e}")

    return Function(
        fn_name="oneshot_sms",
        fn_description=(
            "Send an SMS text message. Costs ~$0.035 USDC per 160-char segment. "
            "Max 1600 characters."
        ),
        args=[
            Argument(name="to_number", type="string", description="Recipient phone number (E.164 format, e.g. +15551234567)", optional=False),
            Argument(name="message", type="string", description="SMS message body (max 1600 chars)", optional=False),
        ],
        executable=_run,
    )


# ---------------------------------------------------------------------------
# 3. Voice
# ---------------------------------------------------------------------------

def make_voice_function(client: OneShotClient) -> Function:
    def _run(args: dict, logger):
        try:
            payload = {
                "target_number": args["target_number"],
                "objective": args["objective"],
            }
            if args.get("caller_persona"):
                payload["caller_persona"] = args["caller_persona"]
            if args.get("max_duration_minutes"):
                payload["max_duration_minutes"] = int(args["max_duration_minutes"])

            result = client.call_tool("/v1/tools/voice/call", payload, timeout_sec=300)
            return _ok(f"Voice call placed to {args['target_number']}", {"result": result})
        except Exception as e:
            return _fail(f"Voice call failed: {e}")

    return Function(
        fn_name="oneshot_voice",
        fn_description=(
            "Make a real phone call with an AI voice agent. Costs ~$0.25 USDC/min. "
            "The agent will follow the objective and return a transcript."
        ),
        args=[
            Argument(name="target_number", type="string", description="Phone number to call (E.164)", optional=False),
            Argument(name="objective", type="string", description="What the voice agent should accomplish on the call", optional=False),
            Argument(name="caller_persona", type="string", description="Persona for the caller (optional)", optional=True),
            Argument(name="max_duration_minutes", type="string", description="Max call duration in minutes (default: 10)", optional=True),
        ],
        executable=_run,
    )


# ---------------------------------------------------------------------------
# 4. Research
# ---------------------------------------------------------------------------

def make_research_function(client: OneShotClient) -> Function:
    def _run(args: dict, logger):
        try:
            payload = {"topic": args["topic"]}
            if args.get("depth"):
                payload["depth"] = args["depth"]

            result = client.call_tool("/v1/tools/research", payload)
            return _ok("Research completed", {"result": result})
        except Exception as e:
            return _fail(f"Research failed: {e}")

    return Function(
        fn_name="oneshot_research",
        fn_description=(
            "Run a deep research report on any topic. Costs $0.50-$2.00 USDC. "
            "Returns a comprehensive report with sources."
        ),
        args=[
            Argument(name="topic", type="string", description="Research topic or question", optional=False),
            Argument(name="depth", type="string", description="Research depth: 'quick' or 'deep' (default: deep)", optional=True),
        ],
        executable=_run,
    )


# ---------------------------------------------------------------------------
# 5. Commerce Search (free)
# ---------------------------------------------------------------------------

def make_commerce_search_function(client: OneShotClient) -> Function:
    def _run(args: dict, logger):
        try:
            params = {"query": args["query"]}
            if args.get("limit"):
                params["limit"] = args["limit"]

            result = client.call_free_get("/v1/tools/commerce/search", params)
            return _ok(f"Found products for '{args['query']}'", {"result": result})
        except Exception as e:
            return _fail(f"Commerce search failed: {e}")

    return Function(
        fn_name="oneshot_commerce_search",
        fn_description=(
            "Search for real products to buy online. Free (no USDC cost). "
            "Returns product listings with prices, images, and URLs."
        ),
        args=[
            Argument(name="query", type="string", description="Product search query", optional=False),
            Argument(name="limit", type="string", description="Max results to return (default: 10)", optional=True),
        ],
        executable=_run,
    )


# ---------------------------------------------------------------------------
# 6. Commerce Buy
# ---------------------------------------------------------------------------

def make_commerce_buy_function(client: OneShotClient) -> Function:
    def _run(args: dict, logger):
        try:
            # Parse shipping_address from JSON string
            shipping = json.loads(args["shipping_address"])

            payload = {
                "product_url": args["product_url"],
                "shipping_address": shipping,
            }
            if args.get("quantity"):
                payload["quantity"] = int(args["quantity"])

            result = client.call_tool("/v1/tools/commerce/buy", payload, timeout_sec=180)
            return _ok("Product purchased", {"result": result})
        except json.JSONDecodeError:
            return _fail(
                "shipping_address must be a JSON string with keys: "
                "first_name, last_name, street, city, state, zip_code, phone"
            )
        except Exception as e:
            return _fail(f"Commerce buy failed: {e}")

    return Function(
        fn_name="oneshot_commerce_buy",
        fn_description=(
            "Purchase a real product online. Costs the product price + service fee in USDC. "
            "Requires a product URL from commerce_search and a shipping address as a JSON string."
        ),
        args=[
            Argument(name="product_url", type="string", description="URL of the product to purchase", optional=False),
            Argument(
                name="shipping_address",
                type="string",
                description=(
                    'JSON string: {"first_name":"John","last_name":"Doe",'
                    '"street":"123 Main St","city":"Austin","state":"TX",'
                    '"zip_code":"78701","phone":"+15551234567"}'
                ),
                optional=False,
            ),
            Argument(name="quantity", type="string", description="Quantity to purchase (default: 1)", optional=True),
        ],
        executable=_run,
    )


# ---------------------------------------------------------------------------
# 7. Build (website generation)
# ---------------------------------------------------------------------------

def make_build_function(client: OneShotClient) -> Function:
    def _run(args: dict, logger):
        try:
            # Parse product from JSON string
            product = json.loads(args["product"])

            payload = {"product": product}
            if args.get("type"):
                payload["type"] = args["type"]
            if args.get("source_url"):
                payload["source_url"] = args["source_url"]

            result = client.call_tool("/v1/tools/build", payload, timeout_sec=600)
            return _ok("Website built", {"result": result})
        except json.JSONDecodeError:
            return _fail(
                "product must be a JSON string with keys: name, description "
                "(and optionally industry, pricing)"
            )
        except Exception as e:
            return _fail(f"Build failed: {e}")

    return Function(
        fn_name="oneshot_build",
        fn_description=(
            "Generate and deploy a real website. Costs ~$10+ USDC depending on complexity. "
            "Returns a live URL. Product info must be a JSON string."
        ),
        args=[
            Argument(
                name="product",
                type="string",
                description=(
                    'JSON string: {"name":"Acme SaaS","description":"Project management tool",'
                    '"industry":"SaaS","pricing":"$29/mo"}'
                ),
                optional=False,
            ),
            Argument(name="type", type="string", description="Site type: saas, portfolio, agency, personal, product, funnel, restaurant, event", optional=True),
            Argument(name="source_url", type="string", description="URL to clone/improve from (optional)", optional=True),
        ],
        executable=_run,
    )
