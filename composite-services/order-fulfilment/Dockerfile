FROM python:3.11-slim

WORKDIR /app

# Copy shared first (if rarely changes)
COPY shared/ ./shared/

# Copy requirements separately — cached unless requirements.txt changes
COPY composite-services/order-fulfilment/requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip3 install -r requirements.txt
COPY composite-services/order-fulfilment/ .

RUN pip3 install --no-cache-dir -r requirements.txt

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8081"]
