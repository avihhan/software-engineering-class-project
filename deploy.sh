#!/usr/bin/env bash
#
# AuraFit — Deploy to GCP Cloud Run
#
# Prerequisites:
#   1. gcloud CLI installed and authenticated
#   2. A GCP project with Cloud Run and Cloud Build APIs enabled
#   3. Set the variables below or pass as environment variables
#
# Usage:
#   chmod +x deploy.sh
#   GCP_PROJECT=my-project REGION=us-central1 ./deploy.sh

set -euo pipefail

GCP_PROJECT="${GCP_PROJECT:?Set GCP_PROJECT}"
REGION="${REGION:-us-central1}"
SUPABASE_URL="${SUPABASE_URL:?Set SUPABASE_URL}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:?Set SUPABASE_ANON_KEY}"
SERVER_URL="${SERVER_URL:?Set SERVER_URL (e.g. https://aurafit-server-XXXX.us-central1.run.app)}"
WEB_PORTAL_URL="${WEB_PORTAL_URL:?Set WEB_PORTAL_URL}"
MOBILE_URL="${MOBILE_URL:?Set MOBILE_URL}"

echo "=== AuraFit Deployment ==="
echo "Project : $GCP_PROJECT"
echo "Region  : $REGION"
echo "Server  : $SERVER_URL"
echo ""

gcloud config set project "$GCP_PROJECT"

echo ">> Submitting Cloud Build..."
gcloud builds submit . \
  --config=cloudbuild.yaml \
  --substitutions="_REGION=$REGION,_SUPABASE_URL=$SUPABASE_URL,_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY,_SERVER_URL=$SERVER_URL,_WEB_PORTAL_URL=$WEB_PORTAL_URL,_MOBILE_URL=$MOBILE_URL"

echo ""
echo "=== Deployment complete! ==="
echo ""
echo "Service URLs:"
gcloud run services list --region="$REGION" --format="table(SERVICE,URL)" \
  --filter="metadata.name ~ aurafit"
