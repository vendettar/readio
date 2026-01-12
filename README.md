# Readio

**Readio** is a modern, local-first web application for audio playback and language learning. It seamlessly integrates podcast discovery with local file management, offering a unique "read-while-listening" experience through synchronized transcripts.

## ✨ Features

- **🎧 Hybrid Audio Engine**: Plays both online podcasts (via RSS/iTunes) and local audio files (MP3).
- **📜 Transcript Sync**: First-class support for `.srt` subtitles and JSON-based transcripts, keeping text perfectly synced with audio.
- **📂 Local-First Library**: Manage your audio collection locally using IndexedDB (via Dexie.js). No account required.
- **🔍 Global Search**: Unified search experience for finding podcasts online and filtering local library content simultaneously.
- **🌍 Multi-Language Support**: Fully localized interface (i18n) supporting multiple languages.
- **🎨 Modern UI**: Beautiful, responsive interface built with Tailwind CSS and shadcn/ui components.

## 🛠️ Tech Stack

- **Framework**: [React](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Routing**: [TanStack Router](https://tanstack.com/router) (File-based routing)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Data Fetching**: [TanStack Query](https://tanstack.com/query)
- **Persistence**: [Dexie.js](https://dexie.org/) (IndexedDB wrapper)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- **Testing**: [Vitest](https://vitest.dev/) (Unit) + [Playwright](https://playwright.dev/) (E2E)

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or pnpm

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/your-username/readio.git
    cd readio
    ```

2.  **Install dependencies**
    ```bash
    npm install
    # or
    pnpm install
    ```

3.  **Start the development server**
    ```bash
    npm run dev
    ```
    The app will run at `http://localhost:5173`.

## 🏗️ Project Structure

```
src/
├── components/        # Shared UI components (shadcn, AppShell, etc.)
├── routeComponents/   # Page components (UI implementation for routes)
├── routes/            # Route definitions (TanStack Router config)
├── hooks/             # Custom React hooks
├── lib/               # Utility functions (cn, etc.)
├── libs/              # Core business logic (DB, API, Parsers)
├── store/             # Global state stores (Zustand)
└── constants/         # App constants
docs/                  # Architecture & Design documentation
```

## 📖 Documentation

Detailed documentation is available in the `docs/` directory:

- [**Best Practices**](docs/best_practice.md): Coding standards and architectural guidelines.
- [**Design System**](docs/design_system.md): UI/UX rules and styling guide.
- [**Technology Roadmap**](docs/technology_roadmap.md): Future plans and technical decisions.

## 🤝 Contributing

Contributions are welcome! Please read `docs/front-vibe-coding-charter.md` before submitting a Pull Request to ensure alignment with our coding standards.

## 📄 License

[MIT](LICENSE)