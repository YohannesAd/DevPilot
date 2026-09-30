"""Read-only revision and Alembic metadata comparison; never apply migrations."""
import argparse
from pathlib import Path

from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text

from app.config import get_database_url
from app.models import Base


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True, help="Expected database name")
    args = parser.parse_args()
    url = get_database_url()
    if url.database != args.database:
        raise SystemExit("Configured database differs from the requested target.")
    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    heads = set(ScriptDirectory.from_config(cfg).get_heads())
    engine = create_engine(url, hide_parameters=True)
    try:
        with engine.connect() as connection:
            connection.execute(text("SET TRANSACTION READ ONLY"))
            actual = connection.scalar(text("SELECT current_database()"))
            if actual != args.database:
                raise SystemExit("Connected database differs from requested target.")
            context = MigrationContext.configure(connection, opts={"compare_type": True})
            current = set(context.get_current_heads())
            differences = compare_metadata(context, Base.metadata)
            print(f"Database: {actual}; revision: {', '.join(sorted(current))}; schema differences: {len(differences)}")
            if len(heads) != 1 or current != heads or differences:
                raise SystemExit("Revision or ORM schema mismatch; review before changing this database.")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
