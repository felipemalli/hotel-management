FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    UV_CACHE_DIR=/tmp/uv-cache \
    UV_PYTHON_PREFERENCE=only-system \
    UV_FROZEN=1 \
    UV_NO_SYNC=1

# --home: sem home valido o control server do gunicorn 26 falha em /nonexistent.
RUN addgroup --system app \
    && adduser --system --ingroup app --home /home/app app \
    && mkdir -p /home/app && chown app:app /home/app

WORKDIR /app
RUN chown app:app /app
USER app

COPY --chown=app:app pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev

COPY --chown=app:app . .

EXPOSE 8000
CMD ["uv", "run", "gunicorn", "config.wsgi", "-b", "0.0.0.0:8000"]
