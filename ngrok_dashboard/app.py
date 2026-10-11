import os

from flask import Flask, jsonify, render_template, request

from .inspector import RequestLog
from .tunnels import TunnelError, TunnelManager

MAX_BODY = 1024 * 1024


def create_app(tunnel_manager=None, request_log=None):
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = MAX_BODY
    manager = tunnel_manager or TunnelManager(os.environ.get("NGROK_AUTHTOKEN"))
    log = request_log or RequestLog()
    app.extensions["tunnels"] = manager

    @app.before_request
    def block_public_access_to_dashboard():
        # ngrok adds X-Forwarded-For to tunnelled traffic, so a request carrying it
        # came from the internet. Only the webhook endpoints may be reached that way.
        if "X-Forwarded-For" in request.headers and not request.path.startswith("/hook/"):
            return jsonify(error="forbidden"), 403

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/api/tunnels")
    def list_tunnels():
        return jsonify(manager.list())

    @app.post("/api/tunnels")
    def start_tunnel():
        data = request.get_json(silent=True) or {}
        try:
            port = int(data.get("port"))
        except (TypeError, ValueError):
            return jsonify(error="port must be an integer"), 400
        try:
            return jsonify(manager.start(port)), 201
        except TunnelError as exc:
            return jsonify(error=str(exc)), 400

    @app.delete("/api/tunnels/<tid>")
    def stop_tunnel(tid):
        try:
            manager.stop(tid)
        except TunnelError as exc:
            return jsonify(error=str(exc)), 404
        return "", 204

    @app.route("/hook/", defaults={"subpath": ""}, methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    @app.route("/hook/<path:subpath>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    def capture(subpath):
        entry = log.add(
            request.method,
            "/hook/" + subpath,
            dict(request.headers),
            request.query_string.decode(errors="replace"),
            request.get_data(as_text=True),
        )
        return jsonify(received=entry["id"]), 200

    @app.get("/api/requests")
    def list_requests():
        return jsonify(log.all())

    @app.delete("/api/requests")
    def clear_requests():
        log.clear()
        return "", 204

    return app


def main():
    try:
        from dotenv import load_dotenv

        load_dotenv()
    except ImportError:
        pass
    app = create_app()
    port = int(os.environ.get("PORT", "5000"))
    try:
        # Bind to localhost only: the dashboard controls tunnels and must not be exposed.
        app.run(host="127.0.0.1", port=port)
    finally:
        app.extensions["tunnels"].stop_all()


if __name__ == "__main__":
    main()
