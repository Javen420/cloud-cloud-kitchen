FROM python:3.11-slim

WORKDIR /app

COPY atomic-services/verify-address/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY atomic-services/verify-address/ .

EXPOSE 8084

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8084}"]
