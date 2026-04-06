#!/usr/bin/env sh
# One-time (or when tokens expire): grants local apps full Firestore access via
# your Google account — same IAM as the account on GCP (no JSON key in the repo).
set -e
if ! command -v gcloud >/dev/null 2>&1; then
    GCLOUD_BIN="${HOME}/google-cloud-sdk/bin/gcloud"
    if [ -x "$GCLOUD_BIN" ]; then
        export PATH="${HOME}/google-cloud-sdk/bin:$PATH"
    else
        echo "Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install"
        exit 1
    fi
fi
exec gcloud auth application-default login
