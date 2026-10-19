FROM python:3.12-slim

RUN useradd -m -u 10002 appuser
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
# /model (volume) inscriptible par l'utilisateur non-root
RUN mkdir -p /model && chown 10002:10002 /model
USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
