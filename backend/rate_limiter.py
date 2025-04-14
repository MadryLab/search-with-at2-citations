import time
import threading
from collections import defaultdict
from typing import Callable
from fastapi import Request, HTTPException


class RateLimiter:
    """Simple in-memory rate limiter that tracks requests per user (by IP address)"""
    
    def __init__(self):
        self.requests = defaultdict(list)
        self.locks = defaultdict(threading.Lock)
    
    def _clean_old_requests(self, user_id: str, window: int):
        """Remove requests older than the rate limit window (in seconds)"""
        now = time.time()
        with self.locks[user_id]:
            self.requests[user_id] = [
                req_time for req_time in self.requests[user_id] 
                if now - req_time < window
            ]
    
    def is_rate_limited(self, user_id: str, max_requests: int, window: int = 3600) -> bool:
        """
        Check if a user has exceeded their rate limit
        
        Args:
            user_id: Identifier for the user (typically IP address)
            max_requests: Maximum number of requests allowed in the time window
            window: Time window in seconds (default: 3600s = 1 hour)
            
        Returns:
            bool: True if rate limited, False otherwise
        """
        self._clean_old_requests(user_id, window)
        
        with self.locks[user_id]:
            if len(self.requests[user_id]) >= max_requests:
                return True
            
            # Record this request
            self.requests[user_id].append(time.time())
            return False
    
    def get_remaining_requests(self, user_id: str, max_requests: int, window: int = 3600) -> int:
        """Return the number of remaining requests allowed"""
        self._clean_old_requests(user_id, window)
        
        with self.locks[user_id]:
            return max(0, max_requests - len(self.requests[user_id]))
    
    def get_reset_time(self, user_id: str, window: int = 3600) -> float:
        """Return the time (in seconds) until the rate limit resets"""
        with self.locks[user_id]:
            if not self.requests[user_id]:
                return 0
            
            oldest_request = min(self.requests[user_id])
            return max(0, oldest_request + window - time.time())


# Rate limiter dependencies
def get_user_id(request: Request) -> str:
    """Extract user identifier from request (using IP address)"""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def create_rate_limiter(rate_limiter: RateLimiter, limit: int, window: int = 3600) -> Callable:
    """
    Factory function to create rate limiter dependencies with specific limits
    
    Args:
        limit: Maximum number of requests allowed in the time window
        window: Time window in seconds (default: 3600s = 1 hour)
    """
    async def rate_limit_dependency(request: Request):
        user_id = get_user_id(request)
        
        if rate_limiter.is_rate_limited(user_id, limit, window):
            reset_time = rate_limiter.get_reset_time(user_id, window)
            headers = {
                "X-RateLimit-Limit": str(limit),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(int(reset_time)),
                "Retry-After": str(int(reset_time))
            }
            raise HTTPException(
                status_code=429, 
                detail=f"Rate limit exceeded. Try again in {int(reset_time)} seconds.",
                headers=headers
            )
        
        # Add rate limit headers to response
        remaining = rate_limiter.get_remaining_requests(user_id, limit, window)
        reset_time = rate_limiter.get_reset_time(user_id, window)
        
        # These will be added to the response in the middleware
        request.state.rate_limit_headers = {
            "X-RateLimit-Limit": str(limit),
            "X-RateLimit-Remaining": str(remaining),
            "X-RateLimit-Reset": str(int(reset_time))
        }
        
        return user_id
    
    return rate_limit_dependency
