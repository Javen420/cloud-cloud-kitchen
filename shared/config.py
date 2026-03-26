#calls env variables and converts it into strings for python

from pydantic_settings import BaseSettings

class Settings(BaseSettings):

    # ── Supabase ──
    supabase_url: str = ""
    supabase_key: str = ""

    # ── Supabase Auth ──
    # Used to verify driver/user tokens without a network call
    supabase_jwt_secret: str = ""

    # ── Redis ──
    redis_addr: str = "localhost:6379"
    redis_password: str = ""

    # ── RabbitMQ ──
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672/"

    # ── Google Routes ──
    google_routes_api_key: str = ""

    # ── Stripe ──
    stripe_secret_key: str = ""

    # ── OutSystems Menu ──
    outsystems_menu_url: str = ""

    # ── Service URLs (composites use these to call atomics) ──
    # Scenario 1
    order_fulfilment_url: str = "http://localhost:8081"

    # Scenario 2
    assign_kitchen_url: str = "http://localhost:8083"
    order_fulfilment_coord_url: str = "http://localhost:8084"

    # Scenario 3
    assign_driver_url: str = "http://localhost:8086"
    eta_tracking_url: str = "http://localhost:8087"
    eta_calculation_url: str = "http://localhost:8084"

    # Notification
    notification_url: str = "http://localhost:8090"

    # ── Server ──
    port: int = 8080

    class Config:
        env_file = ".env"
        extra = "ignore"