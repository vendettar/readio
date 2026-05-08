# Build stage
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git

# Copy go mod and sum files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
# Disable CGO for a truly static binary
RUN CGO_ENABLED=0 GOOS=linux go build -o cloud-api .


# Run stage
FROM alpine:latest

# Install CA certificates for HTTPS requests to upstream APIs
RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

# Copy the binary from builder
COPY --from=builder /app/cloud-api .

# Create directory for SQLite database
RUN mkdir -p /etc/readio && chmod 777 /etc/readio

# Default environment variables
ENV READIO_CLOUD_DB_PATH=/etc/readio/readio.db
ENV PORT=8080

# Health check: perform self-check every 60 seconds
HEALTHCHECK --interval=60s --timeout=5s --start-period=5s --retries=3 \
  CMD ["./cloud-api", "-check-health"]


EXPOSE 8080


ENTRYPOINT ["./cloud-api"]
