#!/bin/bash
set -e

echo "========================================="
echo "Deploying CIN7 Stripe Integration to Google Cloud Run"
echo "========================================="

# Configuration
PROJECT_ID="YOUR_PROJECT_ID"
SERVICE_NAME="cin7-stripe-integration"
REGION="us-central1"
SERVICE_FILE="gcp/service.yaml"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "Error: gcloud CLI is not installed. Please install it first."
    exit 1
fi

# Check if service file exists
if [ ! -f "$SERVICE_FILE" ]; then
    echo "Error: Service file not found: $SERVICE_FILE"
    exit 1
fi

# Ensure you've replaced PROJECT_ID
echo "WARNING: Ensure you've replaced PROJECT_ID in gcp/service.yaml"
read -p "Press Enter to continue or Ctrl+C to abort..."

# Set project
echo "Setting project to $PROJECT_ID..."
gcloud config set project $PROJECT_ID

# Deploy service
echo "Deploying service..."
gcloud run services replace $SERVICE_FILE --region=$REGION

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
  --region=$REGION \
  --format='value(status.url)')

echo ""
echo "========================================="
echo "Deployment Complete!"
echo "========================================="
echo "Service URL: $SERVICE_URL"
echo ""
echo "Test health endpoint:"
echo "  curl $SERVICE_URL/health"
echo ""
echo "View logs:"
echo "  gcloud logging read \"resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME\" --limit=50 --format=json"
echo ""
echo "Check service status:"
echo "  gcloud run services describe $SERVICE_NAME --region=$REGION"
