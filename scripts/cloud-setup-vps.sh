#!/usr/bin/env bash
set -euo pipefail

# Readio Cloud Initial VPS Bootstrap Script
# This script prepares the server directory layout, sudoers, and systemd service.
# It DOES NOT inject dynamic environment variables. Secrets should be synced
# via the GitHub Actions CI/CD deployment pipeline.

ENVIRONMENT="${1:-production}" # "production" or "preproduction"

if [ "$ENVIRONMENT" = "production" ]; then
    SERVICE_NAME="readio-cloud"
    REMOTE_ROOT="/opt/readio"
    PORT_VAL=8080
elif [ "$ENVIRONMENT" = "preproduction" ]; then
    SERVICE_NAME="readio-cloud-pre"
    REMOTE_ROOT="/opt/readio-pre"
    PORT_VAL=8079
else
    echo "Usage: $0 [production|preproduction]"
    exit 1
fi

DEPLOY_USER="${SUDO_USER:-$(id -un)}"
DEPLOY_GROUP="$(id -gn "$DEPLOY_USER")"
SYSTEMCTL_BIN="$(command -v systemctl)"

RELEASES_DIR="$REMOTE_ROOT/releases"
SHARED_DATA_DIR="$REMOTE_ROOT/shared/data"
PODCASR_TRANSCRIPTS_DIR="$SHARED_DATA_DIR/podcast/transcripts"
CURRENT_DIR="$REMOTE_ROOT/current"
DB_PATH="$SHARED_DATA_DIR/readio.db"
ENV_FILE="/etc/readio/${SERVICE_NAME}.env"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
SUDOERS_FILE="/etc/sudoers.d/${SERVICE_NAME}-cd"

echo "Bootstrapping $ENVIRONMENT ($SERVICE_NAME) at $REMOTE_ROOT"

# Create directories
sudo mkdir -p "$RELEASES_DIR"
sudo mkdir -p "$SHARED_DATA_DIR"
sudo mkdir -p "$PODCASR_TRANSCRIPTS_DIR"
sudo mkdir -p /etc/readio
sudo chown -R "$DEPLOY_USER:$DEPLOY_GROUP" "$REMOTE_ROOT"

# Create initial empty or baseline env file (Secrets will be written by CI/CD)
if [ ! -f "$ENV_FILE" ]; then
    sudo tee "$ENV_FILE" >/dev/null <<EOF
# Base Environment file for $SERVICE_NAME
# ---------------------------------------------------------
# DO NOT MANUALLY EDIT SENSITIVE SECRETS HERE IF YOU ARE USING CI/CD.
# GitHub Actions will sync secrets (Tokens, API Keys) during deploy.
# You may specify stable topology variables here.

READIO_TRUSTED_PROXY_CIDRS=127.0.0.1/32,::1/128
READIO_ASR_RATE_LIMIT_BURST=60
READIO_ASR_RATE_LIMIT_WINDOW_MS=60000
READIO_PROXY_RATE_LIMIT_BURST=5
READIO_PROXY_RATE_LIMIT_WINDOW_MS=60000
EOF
    sudo chmod 600 "$ENV_FILE"
    echo "Created baseline env file at $ENV_FILE"
fi

# Write systemd service
sudo tee "$SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=Readio Cloud Backend ($ENVIRONMENT)
After=network.target

[Service]
Type=simple
User=$DEPLOY_USER
WorkingDirectory=$CURRENT_DIR
ExecStart=$CURRENT_DIR/readio-cloud
Restart=always
EnvironmentFile=$ENV_FILE

Environment=PORT=$PORT_VAL
Environment=READIO_CLOUD_UI_DIST_DIR=$CURRENT_DIR/dist
Environment=READIO_CLOUD_DB_PATH=$DB_PATH

[Install]
WantedBy=multi-user.target
EOF
echo "Created systemd service at $SERVICE_FILE"

# Write sudoers rule
sudo tee "$SUDOERS_FILE" >/dev/null <<EOF
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL_BIN restart $SERVICE_NAME, $SYSTEMCTL_BIN is-active --quiet $SERVICE_NAME, $SYSTEMCTL_BIN status $SERVICE_NAME --no-pager -l, /usr/bin/journalctl -u $SERVICE_NAME -n 100 --no-pager
EOF
sudo chmod 440 "$SUDOERS_FILE"
echo "Created sudoers rule at $SUDOERS_FILE"

# Reload systemd
sudo "$SYSTEMCTL_BIN" daemon-reload
sudo "$SYSTEMCTL_BIN" enable "$SERVICE_NAME"

echo "---------------------------------------------------------"
echo "Bootstrap complete!"
echo "Data root: $REMOTE_ROOT"
echo "Next steps:"
echo "1. Configure your GitHub Actions Secrets and Variables."
echo "2. Run the GitHub Actions deploy workflow, which will push the binary and sync the .env file."
echo "3. The workflow will automatically restart the service."
