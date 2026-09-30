"""Validate deployment settings without printing secrets or connecting to a database."""
from app.config import get_auth_settings, get_database_url, get_proxy_settings, get_rate_limit_settings


def main():
    get_auth_settings()
    get_database_url()
    get_proxy_settings()
    get_rate_limit_settings()
    print("Backend configuration is valid (no database connection performed).")


if __name__ == "__main__":
    main()
