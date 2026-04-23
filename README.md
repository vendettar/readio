# Readio Monorepo

**Readio** is a modern, web application for audio playback and language learning. This repository is a monorepo containing multiple applications and shared packages.

## 🏗️ Monorepo Structure

- **apps/**
  - `cloud-api`: (Go) Backend relay and API service for discovery, ASR, and proxy.
  - `cloud-ui`: (@readio/cloud-ui) The React + Vite frontend application.
  - `docs`: The documentation site built with Fumadocs (Next.js).
  - `native`: Scaffold directory for the planned native app.
- **packages/**
  - `core`: (@readio/core) Shared business logic, Zod schemas, and types.
  - `ui`: Placeholder directory for shared UI components.
  - `config`: Placeholder directory for shared engineering configurations.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20 or higher recommended)
- [Go](https://go.dev/) (v1.22 or higher)
- [pnpm](https://pnpm.io/) (v10 or higher required for workspace support)

### Installation

1.  **Clone the repository**
    ```bash
    git clone <your-readio-repo-url>
    cd readio
    ```

2.  **Install dependencies**
    ```bash
    pnpm install
    ```

### Development

You can run applications individually or all at once using [Turborepo](https://turbo.build/).

-   **Start Cloud (UI + API)**
    ```bash
    # Run from root
    pnpm run cloud:dev
    ```

-   **Start Documentation**
    ```bash
    # Run from root
    pnpm -C apps/docs dev
    ```

### Build & Utility Tasks

-   **Build Everything**
    ```bash
    pnpm build
    ```

-   **Lint & Format**
    ```bash
    pnpm lint     # Run all checks
    pnpm format   # Fix formatting and import sorting
    ```

## 📄 License

[MIT](LICENSE)
