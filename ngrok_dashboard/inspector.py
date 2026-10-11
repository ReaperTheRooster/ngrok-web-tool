"""In-memory store of incoming webhook requests."""
import threading
import time
from collections import deque


class RequestLog:
    def __init__(self, maxlen=200):
        self._items = deque(maxlen=maxlen)
        self._lock = threading.Lock()
        self._next_id = 1

    def add(self, method, path, headers, query, body):
        with self._lock:
            entry = {
                "id": self._next_id,
                "time": time.strftime("%Y-%m-%d %H:%M:%S"),
                "method": method,
                "path": path,
                "query": query,
                "headers": headers,
                "body": body,
            }
            self._next_id += 1
            self._items.appendleft(entry)
            return entry

    def all(self):
        with self._lock:
            return list(self._items)

    def clear(self):
        with self._lock:
            self._items.clear()
