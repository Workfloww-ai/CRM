FROM python:3.11-slim

WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Playwright requires browsers to be installed (needed for the company_reports scraper)
RUN playwright install chromium
RUN playwright install-deps chromium

# Copy the rest of the application code
COPY . .

# Expose the port (Cloud Run sets the PORT environment variable)
ENV PORT=8080

# Start the FastAPI application using Uvicorn
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT}
