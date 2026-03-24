# Readio Monorepo

**Readio** is a modern, local-first web application for audio playback and language learning. This repository is a monorepo containing multiple applications and shared packages.

## 🏗️ Monorepo Structure

- **apps/**
  - `lite`: (@readio/lite) The core React + Vite application (the original Readio project).
  - `docs`: The documentation site built with Fumadocs (Next.js).
  - `cloud`: Scaffold directory for the planned cloud app.
  - `native`: Scaffold directory for the planned native app.
- **packages/**
  - `core`: (@readio/core) Shared business logic, Zod schemas, and types.
  - `ui`: Placeholder directory for shared UI components.
  - `config`: Placeholder directory for shared engineering configurations.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20 or higher recommended)
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

-   **Start Readio Lite (Primary App)**
    ```bash
    # Run from root
    pnpm --filter @readio/lite dev
    ```

-   **Start Documentation**
    ```bash
    # Run from root
    pnpm -C apps/docs dev
    ```

-   **Start All Applications**
    ```bash
    pnpm dev
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

## 🛠️ Tech Stack (Lite App)

- **Framework**: [React](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Routing**: [TanStack Router](https://tanstack.com/router)
- **State**: [Zustand](https://github.com/pmndrs/zustand)
- **Data Fetching**: [TanStack Query](https://tanstack.com/query)
- **Persistence**: [Dexie.js](https://dexie.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- **Orchestration**: [Turborepo](https://turbo.build/)


## 📄 License

[MIT](LICENSE)
