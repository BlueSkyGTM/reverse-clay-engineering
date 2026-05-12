#!/bin/bash
# Fleet Pipeline Deployment Script
# This script deploys the refactored pafa-outbound-pipeline to Google Cloud Run.

PROJECT_ID=$(gcloud config get-value project)
SERVICE_NAME="fleet-pipeline"
REGION="us-central1"

echo "🚀 Deploying $SERVICE_NAME to $PROJECT_ID in $REGION..."

# 1. Build and push to Artifact Registry or GCR
# Note: Using Cloud Build for a zero-config containerization
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME .

# 2. Deploy to Cloud Run
# Ensure the Cloud SQL instance connection name is provided
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --add-cloudsql-instances project-8bd530c5-c699-4b50-868:us-central1:gtm-career-leads \
  --set-env-vars "NODE_ENV=production,DATABASE_URL=postgres://fleet_app:DeepWaterHubPipeline2026@/nocodb_data?host=/cloudsql/project-8bd530c5-c699-4b50-868:us-central1:gtm-career-leads"

echo "✅ Deployment complete!"
