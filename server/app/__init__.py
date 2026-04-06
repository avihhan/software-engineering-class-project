import os

from flask import Flask
from flask_cors import CORS


def create_app() -> Flask:
    app = Flask(__name__)

    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-change-me")
    app.config["SUPABASE_URL"] = os.environ.get("SUPABASE_URL", "")
    app.config["SUPABASE_ANON_KEY"] = os.environ.get("SUPABASE_ANON_KEY", "")
    app.config["SUPABASE_SERVICE_ROLE_KEY"] = os.environ.get(
        "SUPABASE_SERVICE_ROLE_KEY", ""
    )
    app.config["SUPABASE_JWT_SECRET"] = os.environ.get("SUPABASE_JWT_SECRET", "")

    allowed_origins = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ]
    extra = os.environ.get("CORS_ORIGINS", "")
    if extra:
        allowed_origins.extend([o.strip() for o in extra.split(",") if o.strip()])

    CORS(app, origins=allowed_origins)

    from app.auth import bp as auth_bp
    from app.routes import register_routes

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    register_routes(app)

    return app
