FROM python:3.11-slim

WORKDIR /app

COPY shared/ ./shared/

COPY composite-services/assign-driver/requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip3 install -r requirements.txt

COPY composite-services/assign-driver/ .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8086"]
