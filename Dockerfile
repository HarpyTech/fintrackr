FROM node:20-alpine AS frontend-builder

WORKDIR /frontend
COPY package.json vite.config.js ./
COPY app/index.html ./app/index.html
COPY app/public ./app/public
COPY app/src ./app/src
RUN npm install
RUN npm run build

FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
COPY requirements-dev.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir -r requirements-dev.txt

COPY app ./app
COPY --from=frontend-builder /frontend/app/static ./app/static

CMD ["gunicorn", "app.main:app", "-k", "uvicorn.workers.UvicornWorker", "-w", "2", "-b", "0.0.0.0:8000"]
