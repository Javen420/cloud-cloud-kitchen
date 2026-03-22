FROM python:3.11-slim
 
WORKDIR /app
 
COPY atomic-services/kitchen-assignment/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
 
COPY atomic-services/kitchen-assignment/ .
COPY shared/ ./shared/
 
EXPOSE 8091
 
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8091"]
 