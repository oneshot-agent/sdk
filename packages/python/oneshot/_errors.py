"""Error classes mirroring the TypeScript OneShot SDK error hierarchy."""


class OneShotError(Exception):
    """Base error for all OneShot operations."""


class ToolError(OneShotError):
    """HTTP-level error from the OneShot API."""

    def __init__(self, message: str, status_code: int, response_body: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body


class JobError(OneShotError):
    """Async job completed with an error."""

    def __init__(self, message: str, job_id: str, job_error: str) -> None:
        super().__init__(message)
        self.job_id = job_id
        self.job_error = job_error


class JobTimeoutError(OneShotError):
    """Async job exceeded the polling timeout."""

    def __init__(self, job_id: str, elapsed_ms: int) -> None:
        super().__init__(f"Job {job_id} timed out after {elapsed_ms / 1000}s")
        self.job_id = job_id
        self.elapsed_ms = elapsed_ms


class ValidationError(OneShotError):
    """Client-side input validation failure."""

    def __init__(self, message: str, field: str) -> None:
        super().__init__(message)
        self.field = field


class ContentBlockedError(OneShotError):
    """Content safety filter rejected the request."""

    def __init__(self, message: str, categories: list[str]) -> None:
        super().__init__(message)
        self.categories = categories
