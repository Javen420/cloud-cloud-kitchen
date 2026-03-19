FROM python:3.11-slim

WORKDIR /app

# Copy shared first (if rarely changes)
COPY shared/ ./shared/

# Copy requirements separately — cached unless requirements.txt changes
COPY atomic-services/new-orders/requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip3 install -r requirements.txt

COPY atomic-services/new-orders/ .

RUN pip3 install --no-cache-dir -r requirements.txt

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8082"]
