FROM python:3.12-slim

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt

RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY ml ./ml

ARG MODEL_URL="https://github.com/shreejesh2006/server-intelligence/releases/download/models-v1/server-intelligence-models-v1.tar.gz"

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && curl -L "$MODEL_URL" -o /tmp/models.tar.gz \
    && tar -xzf /tmp/models.tar.gz -C /app/ml \
    && rm /tmp/models.tar.gz \
    && apt-get purge -y --auto-remove curl \
    && rm -rf /var/lib/apt/lists/*

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
