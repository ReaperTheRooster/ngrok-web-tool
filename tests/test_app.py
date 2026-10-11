import pytest

from ngrok_dashboard import create_app
from ngrok_dashboard.tunnels import TunnelManager


class FakeListener:
    def __init__(self, port):
        self.port = port
        self.closed = False


class FakeBackend:
    def forward(self, port, authtoken):
        return FakeListener(port)

    def close(self, listener):
        listener.closed = True

    @staticmethod
    def url(listener):
        return f"https://fake-{listener.port}.ngrok.test"


@pytest.fixture
def client():
    app = create_app(tunnel_manager=TunnelManager("token", FakeBackend()))
    return app.test_client()


def test_start_list_stop_tunnel(client):
    res = client.post("/api/tunnels", json={"port": 8080})
    assert res.status_code == 201
    tunnel = res.get_json()
    assert tunnel["url"] == "https://fake-8080.ngrok.test"
    assert client.get("/api/tunnels").get_json() == [tunnel]
    assert client.delete(f"/api/tunnels/{tunnel['id']}").status_code == 204
    assert client.get("/api/tunnels").get_json() == []


def test_rejects_bad_and_duplicate_ports(client):
    assert client.post("/api/tunnels", json={"port": "abc"}).status_code == 400
    assert client.post("/api/tunnels", json={"port": 70000}).status_code == 400
    assert client.post("/api/tunnels", json={"port": 3000}).status_code == 201
    assert client.post("/api/tunnels", json={"port": 3000}).status_code == 400


def test_stop_unknown_tunnel(client):
    assert client.delete("/api/tunnels/nope").status_code == 404


def test_missing_authtoken():
    app = create_app(tunnel_manager=TunnelManager(None, FakeBackend()))
    res = app.test_client().post("/api/tunnels", json={"port": 8080})
    assert res.status_code == 400
    assert "NGROK_AUTHTOKEN" in res.get_json()["error"]


def test_inspector_captures_and_clears(client):
    client.post("/hook/github/push?x=1", data="hello", headers={"X-Test": "yes"})
    items = client.get("/api/requests").get_json()
    assert len(items) == 1
    assert items[0]["method"] == "POST"
    assert items[0]["path"] == "/hook/github/push"
    assert items[0]["query"] == "x=1"
    assert items[0]["body"] == "hello"
    assert items[0]["headers"]["X-Test"] == "yes"
    assert client.delete("/api/requests").status_code == 204
    assert client.get("/api/requests").get_json() == []


def test_index_renders(client):
    assert b"ngrok Dashboard" in client.get("/").data


def test_tunnelled_requests_cannot_reach_dashboard(client):
    fwd = {"X-Forwarded-For": "203.0.113.9"}
    assert client.get("/", headers=fwd).status_code == 403
    assert client.post("/api/tunnels", json={"port": 1234}, headers=fwd).status_code == 403
    assert client.get("/api/requests", headers=fwd).status_code == 403
    assert client.post("/hook/x", data="a", headers=fwd).status_code == 200
