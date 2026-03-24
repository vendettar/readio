#!/bin/sh

# env-config.sh: Generates public/env.js from system environment variables
# Only variables starting with READIO_ are included for security.

ENV_FILE="/usr/share/nginx/html/env.js"

echo "Generating runtime configuration..."
echo "window.__READIO_ENV__ = {" > "$ENV_FILE"

# List all environment variables starting with READIO_
# Use env to list, grep to filter, then sed to format as JS object properties
env | grep '^READIO_' | while IFS='=' read -r key value; do
  # Escape backslashes and double quotes for valid JS string literals.
  escaped_value=$(printf '%s' "$value" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')
  printf '  "%s": "%s",\n' "$key" "$escaped_value" >> "$ENV_FILE"
done

echo "};" >> "$ENV_FILE"

echo "Configuration generated at $ENV_FILE"

# Execute the original command (usually nginx)
exec "$@"
