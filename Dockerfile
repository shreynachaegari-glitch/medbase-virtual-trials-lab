# Serves the UI and API on one port. Hugging Face Spaces expects 7860.
FROM docker.io/library/node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM docker.io/library/python:3.12-slim
ENV PYTHONUNBUFFERED=1 OMP_NUM_THREADS=2 MEDLAB_PUBLIC=1
WORKDIR /app
COPY pyproject.toml ./
COPY medlab ./medlab
COPY requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock && pip install --no-cache-dir --no-deps .
# Public inputs are fetched and checked against data/manifest.json. Only the trials the running app reads.
COPY data/manifest.json ./data/manifest.json
COPY scripts/fetch_data.py ./scripts/fetch_data.py
RUN python scripts/fetch_data.py --runtime-only
COPY results/posterior.json results/validation.json results/train_fit.json ./results/
COPY --from=web /web/dist ./web/dist
RUN useradd -m lab && chown -R lab /app
USER lab
EXPOSE 7860
HEALTHCHECK --interval=60s --timeout=5s CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:7860/api/health', timeout=4)"
CMD ["uvicorn", "medlab.api:app", "--host", "0.0.0.0", "--port", "7860", "--limit-concurrency", "40", "--timeout-keep-alive", "10"]
