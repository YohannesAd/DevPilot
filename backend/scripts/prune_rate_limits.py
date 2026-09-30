"""Delete only expired authentication counters; schedule at least once a minute."""
import argparse

from sqlalchemy import create_engine, exists, select, text
from sqlalchemy.orm import Session

from app.config import get_database_url
from app.models import AuthRateLimit
from app.services.rate_limits import database_now, prune_expired


def bounded(value):
    number = int(value)
    if not 1 <= number <= 1000:
        raise argparse.ArgumentTypeError("Use an integer between 1 and 1000.")
    return number


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True, help="Expected database name")
    parser.add_argument("--batch-size", type=bounded, default=100)
    parser.add_argument("--max-batches", type=bounded, default=100)
    args = parser.parse_args()
    url = get_database_url()
    if url.database != args.database:
        raise SystemExit("Configured database differs from requested target.")
    engine = create_engine(url, hide_parameters=True)
    try:
        with Session(engine) as db:
            if db.scalar(text("SELECT current_database()")) != args.database:
                raise SystemExit("Connected database differs from requested target.")
            total = 0
            for _ in range(args.max_batches):
                db.execute(text("SET LOCAL lock_timeout = '2s'"))
                db.execute(text("SET LOCAL statement_timeout = '3s'"))
                removed = prune_expired(db, database_now(db), args.batch_size)
                db.commit()
                total += removed
                if removed < args.batch_size:
                    break
            backlog = db.scalar(select(exists().where(AuthRateLimit.expires_at <= database_now(db))))
            print(f"Expired counters removed: {total}; expired backlog: {bool(backlog)}")
            if backlog:
                raise SystemExit(1)  # Monitor and rerun; do not silently leave a retention backlog.
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
