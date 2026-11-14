"""Small in-process sliding-window rate limiter for auth endpoints.

It protects a single API process. If you run several workers/replicas, put a
shared limiter in front (e.g. nginx `limit_req`, which the provided nginx config does).
"""

import threading
import time
from collections import defaultdict, deque

from app.core.errors import TooManyRequests


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str, limit: int, window_seconds: int, message: str = "Too many attempts. Please wait and try again.") -> None:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and q[0] <= now - window_seconds:
                q.popleft()
            if len(q) >= limit:
                retry = int(window_seconds - (now - q[0])) + 1
                raise TooManyRequests(message, details={"retryAfter": retry})
            q.append(now)

    def reset(self, key: str | None = None) -> None:
        with self._lock:
            if key is None:
                self._hits.clear()
            else:
                self._hits.pop(key, None)


limiter = RateLimiter()
