FROM node:20-alpine AS frontend-builder

WORKDIR /frontend
COPY package.json package-lock.json vite.config.js ./
COPY app/index.html ./app/index.html
COPY app/public ./app/public
COPY app/src ./app/src
RUN npm ci --omit=dev
RUN npm run build

FROM python:3.12-slim

WORKDIR /code

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY --from=frontend-builder /frontend/app/static ./app/static

RUN addgroup --system app && adduser --system --ingroup app app \
  && chown -R app:app /code
USER app

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:8000/health || exit 1

CMD ["gunicorn", "app.main:app", "-k", "uvicorn.workers.UvicornWorker", "-w", "2", "-b", "0.0.0.0:8000"]
