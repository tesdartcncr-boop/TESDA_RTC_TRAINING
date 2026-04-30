from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import logging
import os
from dotenv import load_dotenv
from pathlib import Path
from urllib.parse import quote, urlparse, urlunparse

logger = logging.getLogger(__name__)

# Load .env from backend directory
env_path = Path(__file__).parent / '.env'
load_dotenv(env_path)

def normalize_database_url(database_url: str, supabase_url: str) -> str:
    if not database_url or not supabase_url:
        return database_url

    parsed_db = urlparse(database_url)
    parsed_supabase = urlparse(supabase_url)

    if not parsed_db.hostname or not parsed_db.hostname.endswith("pooler.supabase.com"):
        return database_url

    project_ref = (parsed_supabase.hostname or "").split(".")[0]
    username = parsed_db.username or ""
    password = parsed_db.password or ""

    if not username.startswith("postgres.") or not project_ref:
        return database_url

    current_ref = username.split(".", 1)[1]
    if current_ref == project_ref:
        return database_url

    corrected_username = f"postgres.{project_ref}"
    corrected_netloc = corrected_username
    if password:
        corrected_netloc = f"{quote(corrected_username, safe='')}:{quote(password, safe='')}@{parsed_db.hostname}"
    else:
        corrected_netloc = f"{quote(corrected_username, safe='')}@{parsed_db.hostname}"

    if parsed_db.port:
        corrected_netloc = f"{corrected_netloc}:{parsed_db.port}"

    logger.warning("Corrected Supabase pooler username in DATABASE_URL to match SUPABASE_URL project ref.")
    return urlunparse(parsed_db._replace(netloc=corrected_netloc))

# Database configuration
DATABASE_URL = normalize_database_url(
    os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/trainer_portal"),
    os.getenv("SUPABASE_URL", ""),
)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependency to get database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
