FROM python:3.11-slim

WORKDIR /app

COPY composite-services/coordinate-fulfilment/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY composite-services/coordinate-fulfilment/ .

EXPOSE 8094

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8094"]