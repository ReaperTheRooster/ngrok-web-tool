"""Tunnel management on top of the official ngrok Python SDK."""
import threading
import uuid


class NgrokBackend:
    """Thin wrapper around the ngrok SDK so tests can swap it out."""

    def forward(self, port, authtoken):
        import ngrok

        return ngrok.forward(port, authtoken=authtoken)

    def close(self, listener):
        listener.close()

    @staticmethod
    def url(listener):
        return listener.url()


class TunnelError(Exception):
    pass


class TunnelManager:
    def __init__(self, authtoken, backend=None):
        self.authtoken = authtoken
        self.backend = backend or NgrokBackend()
        self._tunnels = {}
        self._lock = threading.Lock()

    def start(self, port):
        if not self.authtoken:
            raise TunnelError("NGROK_AUTHTOKEN is not set")
        if not isinstance(port, int) or not 1 <= port <= 65535:
            raise TunnelError("port must be an integer between 1 and 65535")
        with self._lock:
            if any(t["port"] == port for t in self._tunnels.values()):
                raise TunnelError(f"a tunnel for port {port} is already running")
            try:
                listener = self.backend.forward(port, self.authtoken)
            except Exception as exc:
                raise TunnelError(f"ngrok failed to start: {exc}") from exc
            tid = uuid.uuid4().hex[:8]
            self._tunnels[tid] = {
                "id": tid,
                "port": port,
                "url": self.backend.url(listener),
                "listener": listener,
            }
            return self._public(self._tunnels[tid])

    def stop(self, tid):
        with self._lock:
            tunnel = self._tunnels.pop(tid, None)
        if tunnel is None:
            raise TunnelError("no such tunnel")
        self.backend.close(tunnel["listener"])

    def stop_all(self):
        for tid in list(self._tunnels):
            try:
                self.stop(tid)
            except TunnelError:
                pass

    def list(self):
        with self._lock:
            return [self._public(t) for t in self._tunnels.values()]

    @staticmethod
    def _public(tunnel):
        return {k: tunnel[k] for k in ("id", "port", "url")}
