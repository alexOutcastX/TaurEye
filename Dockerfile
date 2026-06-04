# TaurEye backend API — containerized for a cloud host (e.g. Oracle Always-Free).
# Serves the FastAPI app over :8010 reading the SQLite spine from a mounted
# volume (backend/data). The data engine (nightly refresh) runs in this same
# image via `docker compose exec`.
FROM python:3.12-slim

WORKDIR /app

# ca-certificates for the HTTPS bhavcopy/index fetches; curl for healthchecks.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend backend

ENV TAUREYE_PROVIDER=db \
    PYTHONUNBUFFERED=1

EXPOSE 8010
CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8010"]
