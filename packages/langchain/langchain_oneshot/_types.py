"""Pydantic input schemas for all OneShot LangChain tools.

Each model is used as the ``args_schema`` on a BaseTool subclass so that
LangChain agents provide correctly-structured arguments.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Communication
# ---------------------------------------------------------------------------


class EmailInput(BaseModel):
    """Input for the oneshot_email tool."""

    to: str = Field(description="Recipient email address")
    subject: str = Field(description="Email subject line")
    body: str = Field(description="Email body (plain text or HTML)")
    from_domain: Optional[str] = Field(
        default=None, description="Custom sender domain (defaults to oneshotagent.com)"
    )


class VoiceInput(BaseModel):
    """Input for the oneshot_voice tool."""

    objective: str = Field(
        min_length=10,
        description="The objective of the call — what should the agent accomplish",
    )
    target_number: str = Field(description="Target phone number in E.164 format")
    caller_persona: Optional[str] = Field(
        default=None, description="Persona for the AI caller"
    )
    context: Optional[str] = Field(
        default=None, description="Additional context about the call"
    )
    max_duration_minutes: Optional[int] = Field(
        default=None, ge=1, le=30, description="Maximum call duration in minutes (1-30)"
    )


class SmsInput(BaseModel):
    """Input for the oneshot_sms tool."""

    message: str = Field(max_length=1600, description="SMS message body (max 1600 chars)")
    to_number: str = Field(description="Target phone number in E.164 format")


# ---------------------------------------------------------------------------
# Research & Enrichment
# ---------------------------------------------------------------------------


class ResearchInput(BaseModel):
    """Input for the oneshot_research tool."""

    topic: str = Field(description="Research topic")
    depth: Optional[Literal["quick", "deep"]] = Field(
        default=None, description="Research depth (default: deep)"
    )
    max_sources: Optional[int] = Field(
        default=None, description="Maximum number of sources to use"
    )
    output_format: Optional[Literal["report_markdown", "structured_json"]] = Field(
        default=None, description="Output format (default: report_markdown)"
    )


class WebSearchInput(BaseModel):
    """Input for the oneshot_web_search tool."""

    query: str = Field(description="Search query string")
    max_results: Optional[int] = Field(
        default=None, ge=1, le=20, description="Max results to return (default: 5)"
    )


class PeopleSearchInput(BaseModel):
    """Input for the oneshot_people_search tool."""

    job_titles: Optional[list[str]] = Field(default=None, description="Job titles to search")
    keywords: Optional[list[str]] = Field(default=None, description="Keywords to search")
    companies: Optional[list[str]] = Field(default=None, description="Company names")
    location: Optional[list[str]] = Field(default=None, description="Locations to filter by")
    skills: Optional[list[str]] = Field(default=None, description="Skills to filter by")
    seniority: Optional[list[str]] = Field(default=None, description="Seniority levels")
    industry: Optional[list[str]] = Field(default=None, description="Industry filters")
    company_size: Optional[str] = Field(default=None, description="Company size filter")
    limit: Optional[int] = Field(default=None, description="Max results to return")


class EnrichProfileInput(BaseModel):
    """Input for the oneshot_enrich_profile tool."""

    linkedin_url: Optional[str] = Field(default=None, description="LinkedIn profile URL")
    email: Optional[str] = Field(default=None, description="Person's email address")
    name: Optional[str] = Field(default=None, description="Person's full name")
    company_domain: Optional[str] = Field(default=None, description="Company domain")


class FindEmailInput(BaseModel):
    """Input for the oneshot_find_email tool."""

    company_domain: str = Field(description="Company domain (e.g. acme.com)")
    full_name: Optional[str] = Field(default=None, description="Person's full name")
    first_name: Optional[str] = Field(default=None, description="Person's first name")
    last_name: Optional[str] = Field(default=None, description="Person's last name")


class VerifyEmailInput(BaseModel):
    """Input for the oneshot_verify_email tool."""

    email: str = Field(description="Email address to verify")


# ---------------------------------------------------------------------------
# Person Intelligence
# ---------------------------------------------------------------------------


class DeepResearchPersonInput(BaseModel):
    """Input for the oneshot_deep_research_person tool."""

    email: Optional[str] = Field(default=None, description="Person's email address")
    social_media_url: Optional[str] = Field(default=None, description="LinkedIn, Twitter, or other social profile URL")
    name: Optional[str] = Field(default=None, description="Person's full name")
    company: Optional[str] = Field(default=None, description="Company name (helps disambiguate)")


class SocialProfilesInput(BaseModel):
    """Input for the oneshot_social_profiles tool."""

    email: Optional[str] = Field(default=None, description="Person's email address")
    social_media_url: Optional[str] = Field(default=None, description="Known social profile URL to start from")


class ArticleSearchInput(BaseModel):
    """Input for the oneshot_article_search tool."""

    name: str = Field(description="Person's full name")
    company: str = Field(description="Company name or domain")
    sort: Optional[Literal["recent", "popular"]] = Field(default=None, description="Sort order (default: recent)")
    limit: Optional[int] = Field(default=None, ge=1, le=20, description="Max results (default: 5)")


class PersonNewsfeedInput(BaseModel):
    """Input for the oneshot_person_newsfeed tool."""

    social_media_url: str = Field(description="Social profile URL (Twitter, LinkedIn, etc)")


class PersonInterestsInput(BaseModel):
    """Input for the oneshot_person_interests tool."""

    email: Optional[str] = Field(default=None, description="Person's email address")
    phone: Optional[str] = Field(default=None, description="Person's phone number")
    social_media_url: Optional[str] = Field(default=None, description="Social profile URL")


class PersonInteractionsInput(BaseModel):
    """Input for the oneshot_person_interactions tool."""

    social_media_url: str = Field(description="Social profile or post URL (Twitter/X or Instagram)")
    type: Optional[Literal["replies", "followers", "following", "followers,following"]] = Field(
        default=None, description="Interaction type (default: followers,following)"
    )
    max_results: Optional[int] = Field(default=None, ge=1, le=1000, description="Max results (default: 100)")


# ---------------------------------------------------------------------------
# Commerce
# ---------------------------------------------------------------------------


class CommerceSearchInput(BaseModel):
    """Input for the oneshot_commerce_search tool."""

    query: str = Field(description="Product search query")
    limit: Optional[int] = Field(default=None, description="Max results (default: 10)")


class ShippingAddress(BaseModel):
    """Shipping address for commerce purchases."""

    first_name: str = Field(description="Recipient first name")
    last_name: str = Field(description="Recipient last name")
    street: str = Field(description="Street address")
    street2: Optional[str] = Field(default=None, description="Street line 2")
    city: str = Field(description="City")
    state: str = Field(description="State/province code")
    zip_code: str = Field(description="ZIP/postal code")
    country: Optional[str] = Field(default=None, description="Country code (default: US)")
    email: Optional[str] = Field(default=None, description="Contact email")
    phone: str = Field(description="Contact phone number")


class CommerceBuyInput(BaseModel):
    """Input for the oneshot_commerce_buy tool."""

    product_url: str = Field(description="URL of the product to purchase")
    shipping_address: ShippingAddress = Field(description="Shipping address")
    quantity: Optional[int] = Field(default=None, description="Quantity (default: 1)")
    variant_id: Optional[str] = Field(default=None, description="Product variant ID")


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------


class BuildProduct(BaseModel):
    """Product/business information for website builds."""

    name: str = Field(description="Product or business name")
    description: str = Field(min_length=10, description="Description of the product/service")
    industry: Optional[str] = Field(default=None, description="Industry category")
    pricing: Optional[str] = Field(default=None, description="Pricing information")


class BuildLeadCapture(BaseModel):
    """Lead capture configuration."""

    enabled: bool = Field(description="Enable lead capture form")
    inbox_email: Optional[str] = Field(
        default=None, description="Email to receive leads (defaults to agent inbox)"
    )


class BuildBrand(BaseModel):
    """Brand customization for builds."""

    primary_color: Optional[str] = Field(default=None, description="Primary color (hex, e.g. #FF5733)")
    font: Optional[str] = Field(default=None, description="Font family preference")
    tone: Optional[Literal["professional", "playful", "bold", "minimal"]] = Field(
        default=None, description="Brand tone"
    )


class BuildImages(BaseModel):
    """Image URLs for builds."""

    hero: Optional[str] = Field(default=None, description="Hero image URL")
    logo: Optional[str] = Field(default=None, description="Logo image URL")


class BuildInput(BaseModel):
    """Input for the oneshot_build tool."""

    product: BuildProduct = Field(description="Product/business information")
    type: Optional[
        Literal["saas", "portfolio", "agency", "personal", "product", "funnel", "restaurant", "event"]
    ] = Field(default=None, description="Website type (default: saas)")
    source_url: Optional[str] = Field(default=None, description="URL to analyze for content")
    sections: Optional[list[str]] = Field(default=None, description="Sections to include")
    lead_capture: Optional[BuildLeadCapture] = Field(default=None, description="Lead capture config")
    brand: Optional[BuildBrand] = Field(default=None, description="Brand customization")
    images: Optional[BuildImages] = Field(default=None, description="Image URLs")
    domain: Optional[str] = Field(default=None, description="Custom domain")


class UpdateBuildInput(BaseModel):
    """Input for the oneshot_update_build tool."""

    build_id: str = Field(description="Existing build ID to update")
    product: BuildProduct = Field(description="Updated product/business information")
    type: Optional[
        Literal["saas", "portfolio", "agency", "personal", "product", "funnel", "restaurant", "event"]
    ] = Field(default=None, description="Website type")
    source_url: Optional[str] = Field(default=None, description="URL to analyze for content")
    sections: Optional[list[str]] = Field(default=None, description="Sections to include")
    lead_capture: Optional[BuildLeadCapture] = Field(default=None, description="Lead capture config")
    brand: Optional[BuildBrand] = Field(default=None, description="Brand customization")
    images: Optional[BuildImages] = Field(default=None, description="Image URLs")
    domain: Optional[str] = Field(default=None, description="Custom domain")


# ---------------------------------------------------------------------------
# Inbox
# ---------------------------------------------------------------------------


class InboxListInput(BaseModel):
    """Input for the oneshot_inbox_list tool."""

    since: Optional[str] = Field(default=None, description="Filter emails after this ISO timestamp")
    limit: Optional[int] = Field(default=None, description="Max emails to return (default: 50)")
    include_body: Optional[bool] = Field(default=None, description="Include email body content")


class InboxGetInput(BaseModel):
    """Input for the oneshot_inbox_get tool."""

    email_id: str = Field(description="Email ID to retrieve")


class SmsInboxListInput(BaseModel):
    """Input for the oneshot_sms_inbox_list tool."""

    since: Optional[str] = Field(default=None, description="Filter messages after this ISO timestamp")
    limit: Optional[int] = Field(default=None, description="Max messages to return (default: 50, max: 100)")
    from_number: Optional[str] = Field(default=None, description="Filter by sender phone number")


class SmsInboxGetInput(BaseModel):
    """Input for the oneshot_sms_inbox_get tool."""

    message_id: str = Field(description="SMS message ID to retrieve")


# ---------------------------------------------------------------------------
# Account
# ---------------------------------------------------------------------------


class NotificationsInput(BaseModel):
    """Input for the oneshot_notifications tool."""

    unread: Optional[bool] = Field(default=None, description="Only return unread notifications")
    limit: Optional[int] = Field(default=None, description="Max notifications (default: 50, max: 100)")


class MarkNotificationReadInput(BaseModel):
    """Input for the oneshot_mark_notification_read tool."""

    notification_id: str = Field(description="Notification ID (UUID) to mark as read")


class GetBalanceInput(BaseModel):
    """Input for the oneshot_get_balance tool."""

    # No required fields — uses the client's configured token address
