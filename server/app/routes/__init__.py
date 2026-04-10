from flask import Flask


def register_routes(app: Flask):
    """Import and register every route blueprint on the Flask app."""
    from app.routes.health import bp as health_bp
    from app.routes.users import bp as users_bp
    from app.routes.body_metrics import bp as body_metrics_bp
    from app.routes.workouts import bp as workouts_bp
    from app.routes.nutrition import bp as nutrition_bp
    from app.routes.goals import bp as goals_bp
    from app.routes.exercises import bp as exercises_bp
    from app.routes.notifications import bp as notifications_bp
    from app.routes.subscriptions import bp as subscriptions_bp
    from app.routes.progress_photos import bp as progress_photos_bp
    from app.routes.admin import bp as admin_bp
    from app.routes.platform import bp as platform_bp
    from app.routes.ai import bp as ai_bp
    from app.routes.streaks import bp as streaks_bp
    from app.routes.favorites import bp as favorites_bp
    from app.routes.billing import bp as billing_bp
    from app.routes.content_feed import bp as content_feed_bp

    app.register_blueprint(health_bp, url_prefix="/api")
    app.register_blueprint(users_bp, url_prefix="/api")
    app.register_blueprint(body_metrics_bp, url_prefix="/api")
    app.register_blueprint(workouts_bp, url_prefix="/api")
    app.register_blueprint(nutrition_bp, url_prefix="/api")
    app.register_blueprint(goals_bp, url_prefix="/api")
    app.register_blueprint(exercises_bp, url_prefix="/api")
    app.register_blueprint(notifications_bp, url_prefix="/api")
    app.register_blueprint(subscriptions_bp, url_prefix="/api")
    app.register_blueprint(progress_photos_bp, url_prefix="/api")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")
    app.register_blueprint(platform_bp, url_prefix="/api/platform")
    app.register_blueprint(ai_bp, url_prefix="/api/ai")
    app.register_blueprint(streaks_bp, url_prefix="/api")
    app.register_blueprint(favorites_bp, url_prefix="/api")
    app.register_blueprint(billing_bp, url_prefix="/api")
    app.register_blueprint(content_feed_bp, url_prefix="/api")
