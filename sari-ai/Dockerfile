FROM node:22.18.0-bookworm-slim AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
COPY public ./public
RUN npm run typecheck && npm run build

FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py store.py agents.py llm.py ./
COPY --from=frontend /app/dist ./dist
RUN useradd --system --create-home sari
USER sari
CMD ["sh", "-c", "python -c 'from store import initialize; initialize()' && exec gunicorn --bind 0.0.0.0:${PORT:-10000} --workers 2 --threads 2 main:application"]
