# IdeaHub — Product Idea & Feedback System

[![Angular](https://img.shields.io/badge/Angular-22-DD0031?style=flat&logo=angular)](https://angular.dev/)
[![Go](https://img.shields.io/badge/Go-1.24-00ADD8?style=flat&logo=go)](https://go.dev/)
[![Fiber](https://img.shields.io/badge/Fiber-v2.52-00ACD7?style=flat&logo=go)](https://gofiber.io/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL%20Mode-003B57?style=flat&logo=sqlite)](https://www.sqlite.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-v4-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com/)
[![CodeRabbit](https://img.shields.io/badge/CodeRabbit-Verified-green?style=flat)](https://coderabbit.ai/)

**IdeaHub** is a modern, high-performance product feedback and roadmap dashboard built from Sarah Johnson’s product wireframe specification (*Sarah's Feedback Dashboard*). It solves the problem of customer feature requests and bugs arriving scattered across disconnected channels (email threads, Twitter/X DMs, chat widgets, and support tickets) by consolidating them into a single, transparent, and public roadmap.

The system is architected into two focused subprojects:
1. **`idea-hub`**: An Angular 22 client powered by reactive Signals and Tailwind CSS v4 with an editorial ivory aesthetic.
2. **`idea-hub-api`**: A Go 1.24 RESTful microservice powered by Fiber v2 and SQLite in Write-Ahead Logging (WAL) mode.

---

## Table of Contents

- [Project Story & Problem Statement](#project-story--problem-statement)
- [System Architecture](#system-architecture)
- [Tech Stack Breakdown](#tech-stack-breakdown)
  - [Frontend (`idea-hub`)](#frontend-idea-hub)
  - [Backend (`idea-hub-api`)](#backend-idea-hub-api)
- [Directory Structure](#directory-structure)
- [Prerequisites](#prerequisites)
- [How to Build & Run: Backend (`idea-hub-api`)](#how-to-build--run-backend-idea-hub-api)
  - [1. Install Dependencies](#1-install-dependencies)
  - [2. Run Development Server](#2-run-development-server)
  - [3. Build Production Executable](#3-build-production-executable)
  - [4. Environment Variables & Ports](#4-environment-variables--ports)
  - [5. SQLite WAL Database Persistence](#5-sqlite-wal-database-persistence)
- [How to Build & Run: Frontend (`idea-hub`)](#how-to-build--run-frontend-idea-hub)
  - [1. Install Dependencies](#1-install-dependencies-1)
  - [2. Run Development Dev Server](#2-run-development-dev-server)
  - [3. Build Production Web Bundle](#3-build-production-web-bundle)
  - [4. State Management & Signals Architecture](#4-state-management--signals-architecture)
- [Core Feature Walkthrough](#core-feature-walkthrough)
- [REST API Reference & Security](#rest-api-reference--security)
- [Database Schema](#database-schema)
- [Code Quality & MCP Tooling](#code-quality--mcp-tooling)

---

## Project Story & Problem Statement

Before IdeaHub, product teams suffered from:
* **Fragmented Feedback:** Customer requests arrived across personal emails, Twitter/X DMs, Slack channels, and support desks without a single source of truth.
* **Redundant Work:** Multiple customers submitted the same requests repeatedly because there was no public visibility into what had already been suggested.
* **Customer Disconnect:** Submitting users never knew if their idea was seen, rejected, planned, or actively being coded.

### IdeaHub's Guiding Principles:
* **Frictionless for Customers:** No forced password creation or lengthy registration. Submissions use an email verification model.
* **Zero-Leak Data Privacy:** Submitter emails are **never** exposed on public unauthenticated endpoints. Internal team discussions (`is_internal = true`) are structurally shielded from customers.
* **Transparent Status Workflow:** Explicit status stages (`under-review` ➔ `planned` ➔ `in-progress` ➔ `completed`) backed by an immutable audit trail and asynchronous status updates.
* **Duplicate Merging:** Teams can merge redundant ideas into a canonical item while consolidating all community upvotes.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend: idea-hub                           │
│        Angular 22 · Signals Reactive Store · Tailwind v4        │
│                     http://localhost:4300                       │
└────────────────┬────────────────────────────────▲───────────────┘
                 │                                │
       REST JSON │ Requests             JSON/CSV  │ Responses
                 ▼                                │
┌─────────────────────────────────────────────────┴───────────────┐
│                    Backend: idea-hub-api                        │
│          Go 1.24 · Fiber v2 Engine · Strict CORS Filter         │
│                     http://localhost:8080                       │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                         CGO / SQLite3 Driver
                        (WAL Journaling Mode)
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                       SQLite Database                           │
│                  feedback.db (WAL Journaled)                    │
│            [ideas] · [comments] · [status_changes]              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack Breakdown

### Frontend (`idea-hub`)
* **Framework:** **Angular 22** (Standalone Components only; no NgModules).
* **Reactivity & State:** **Angular Signals** (`signal()`, `computed()`, `effect()`) for instant UI updates, derived counts, and multi-factor filtering without external state libraries.
* **HTTP Client:** Angular `HttpClient` configured via `provideHttpClient()`, communicating with the Go backend while maintaining durable local fallback.
* **Styling & Design System:** **Tailwind CSS v4** via `@tailwindcss/postcss`. Features a warm editorial ivory palette (`#F8F7F4`), Playfair Display serif typography for headings, Plus Jakarta Sans for UI elements, and native dark mode (`class="dark"`).
* **Icons:** Inline SVG and Lucide Angular icons.
* **Language:** TypeScript 6.0.

### Backend (`idea-hub-api`)
* **Language & Runtime:** **Go 1.24** (Windows amd64 with MinGW GCC for CGO).
* **Web Framework:** **Go Fiber v2** (`github.com/gofiber/fiber/v2`) — Express-inspired, high-throughput routing engine built on Fasthttp.
* **Database Driver:** `github.com/mattn/go-sqlite3` operating with Write-Ahead Logging (`PRAGMA journal_mode=WAL;`).
* **Identifiers:** Type-safe UUID v4 generation via `github.com/google/uuid`.
* **CORS Middleware:** Configured explicitly for `http://localhost:4300`, `http://localhost:4200`, and `http://127.0.0.1:4300`.
* **Latency Profile:** Sub-millisecond p95 latency on all read and vote endpoints.

---

## Directory Structure

```
├── idea-hub/               # Angular 22 Frontend Application
│   ├── src/app/
│   │   ├── components/     # Standalone components
│   │   │   ├── header/         # Brand, role switcher, notification bell, theme toggle
│   │   │   ├── idea-card/      # Idea card with boxed vote widget & status pill
│   │   │   ├── idea-detail/    # Detail modal with comments, internal notes & audit trail
│   │   │   ├── idea-submit/    # Submit modal with live duplicate detection
│   │   │   └── idea-toolbar/   # Search bar, category filter, status dropdown, sorting
│   │   ├── models/         # TypeScript interfaces (ProductIdea, Comment, UserRole, etc.)
│   │   └── services/       # Services (idea.service.ts, theme.service.ts)
│   ├── SPEC.MD             # Product and Architectural Specification
│   ├── package.json        # Dependencies & build scripts
│   └── tsconfig.json       # TypeScript configuration
│
├── idea-hub-api/           # Go Fiber REST API Service
│   ├── cmd/api/main.go     # Fiber server entrypoint, middleware & routing
│   ├── internal/
│   │   ├── database/db.go  # SQLite schema setup, WAL mode configuration & seed data
│   │   └── handlers/       # REST handlers for ideas, comments, voting, status, CSV
│   ├── go.mod / go.sum     # Go dependencies
│   └── feedback.db         # Local SQLite database (WAL journaled, git-ignored)
│
├── GEMINI.md               # Guidelines & MCP review rules
└── README.md               # Project documentation (this file)
```

---

## Prerequisites

Ensure you have the following installed on your machine:
* **Node.js**: `v20.x` or later
* **pnpm**: `v10.x` or later (`npm install -g pnpm`)
* **Go**: `v1.24` or later
* **CGO Compiler**: MinGW-w64 GCC (required for building `go-sqlite3` on Windows)

---

## How to Build & Run: Backend (`idea-hub-api`)

Navigate to the backend directory:
```bash
cd idea-hub-api
```

### 1. Install Dependencies
Verify and download Go modules:
```bash
go mod tidy
```

### 2. Run Development Server
Start the API server directly:
```bash
go run ./cmd/api
```
The server will initialize `feedback.db` (if not present), configure WAL mode, seed initial data from Sarah's wireframe, and bind to `http://localhost:8080`.

Verify health in another terminal:
```bash
curl http://localhost:8080/health
# Response: {"database":"sqlite","engine":"fiber/v2","status":"healthy"}
```

### 3. Build Production Executable
Compile an optimized, standalone binary:
```bash
# Compile to executable (api.exe on Windows, api on Linux/macOS)
go build -v -o api.exe ./cmd/api
```
Run the compiled binary:
```bash
.\api.exe
```

### 4. Environment Variables & Ports
| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | Port for Fiber HTTP server |
| `DB_NAME` | `feedback.db` | SQLite database file location |

### 5. SQLite WAL Database Persistence
The API uses SQLite with Write-Ahead Logging (`PRAGMA journal_mode=WAL;`). When running, SQLite generates:
* `feedback.db` (Primary database)
* `feedback.db-wal` (Write-ahead log for high-concurrency writes)
* `feedback.db-shm` (Shared-memory index)

These files are git-ignored. To reset the database to fresh seed data, simply stop the server and delete `feedback.db*`.

---

## How to Build & Run: Frontend (`idea-hub`)

Navigate to the frontend directory:
```bash
cd idea-hub
```

### 1. Install Dependencies
Install dependencies with pnpm:
```bash
pnpm install
```

### 2. Run Development Dev Server
Launch the Angular development server:
```bash
pnpm start
# Equivalent to: ng serve
```
Open **`http://localhost:4300`** in your browser. The application includes hot-module reloading and watches for changes.

### 3. Build Production Web Bundle
Generate production-ready static assets:
```bash
pnpm run build
# Outputs to: dist/idea-hub/
```
The build runs AOT compilation and generates highly optimized chunks (under 350 kB total).

### 4. State Management & Signals Architecture
The client's state is encapsulated in `idea.service.ts`:
* **Reactivity:** Angular Signals (`_ideas`, `_notifications`, `currentRole`, `selectedIdeaId`) drive the UI with zero flicker.
* **Automatic Hydration:** On initialization, `GET /api/ideas` hydrates the feed from Go SQLite.
* **Durable Pending Queue:** Submissions made during high latency or offline states are safely queued locally so user data is never lost.
* **Sequence Tracking:** In-flight detail queries track monotonic version sequence numbers to prevent race conditions where an older response could overwrite newer edits.

---

## Core Feature Walkthrough

### 1. Customer Submission with Duplicate Detection
* Click **`+ Submit an idea`** in the header or hero banner.
* Type a title: As you type (≥3 characters), existing ideas matching similar keywords appear in real-time.
* Users can immediately choose to upvote the existing idea instead of submitting a duplicate.

### 2. Role Switcher
In the top right of the navigation bar, toggle between three roles:
* **Customer (`customer`):** Default public board view.
* **Team (`team`):** Reveals submitter email addresses and private team notes.
* **Admin (`admin`):** Enables duplicate merging, status management, and feedback deletion.

### 3. Detail Modal & Internal Notes
Click any idea card to open the detail view:
* **Public Comments:** Visible to all customers.
* **Internal Team Notes:** Marked with a gold lock badge. Only accessible and writable by Team and Admin roles.
* **Audit Trail:** Complete timeline showing every status change, timestamp, actor, and public reasoning note.

### 4. Duplicate Merging Engine (Admin/Team)
* In the detail view of an idea, click **`Merge Duplicate`**.
* Pick the duplicate idea to merge into the current canonical idea.
* The system consolidates all upvotes from the duplicate into the canonical item, marks the duplicate as `merged`, and adds an audit trail note.

### 5. CSV Data Export
* Click the **`Export CSV`** button in the header toolbar to trigger `exportToCsv()`, generating a formatted RFC 4180 CSV export of all filtered ideas.

### 6. Theme Toggle
* Toggle between Editorial Paper (`#F8F7F4`) and Dark Theme (`#1C1C1A`) with persistent localStorage preferences.

---

## REST API Reference & Security

All API endpoints are served under `http://localhost:8080/api`:

| Method | Endpoint | Roles | Request Body / Query Params | Description |
|---|---|---|---|---|
| `GET` | `/health` | Public | None | Health check & SQLite status |
| `GET` | `/api/ideas` | Public / Team | `?status=`, `?q=`, `?sort=` | List ideas. Redacts submitter email for customers |
| `GET` | `/api/ideas/:id` | Public / Team | None | Full detail. Redacts `internalNotes` for customers |
| `POST` | `/api/ideas` | Public | `{ title, description, category, authorName, authorEmail }` | Submit feedback |
| `POST` | `/api/ideas/:id/upvote` | Public | None | Increment upvote counter |
| `POST` | `/api/ideas/:id/status` | Team, Admin | `{ status, note, changedBy }` | Update idea roadmap status with audit log |
| `POST` | `/api/ideas/:id/comments` | Public / Team | `{ authorName, authorEmail, content, isInternal }` | Post comment or confidential team note |
| `POST` | `/api/ideas/merge` | Team, Admin | `{ sourceIdeaId, targetIdeaId, note }` | Merge duplicate and consolidate votes |
| `DELETE` | `/api/ideas/:id` | Admin | None | Delete feedback and comments |
| `GET` | `/api/export/csv` | Public / Team | None | Download CSV export |

### Role Authentication Header:
Send `X-User-Role: <customer | team | admin>` in HTTP headers:
```bash
curl -H "X-User-Role: team" http://localhost:8080/api/ideas/sketch-1
```

---

## Database Schema

The SQLite database (`feedback.db`) consists of three normalized tables:

```sql
CREATE TABLE IF NOT EXISTS ideas (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'under-review',
    author_name TEXT NOT NULL,
    author_email TEXT NOT NULL,
    upvotes INTEGER NOT NULL DEFAULT 1,
    merged_into_id TEXT,
    merged_into_title TEXT,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_email TEXT NOT NULL,
    is_team_member INTEGER NOT NULL DEFAULT 0,
    is_internal INTEGER NOT NULL DEFAULT 0,
    body TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    FOREIGN KEY(idea_id) REFERENCES ideas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS status_changes (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL,
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    changed_by TEXT NOT NULL,
    public_note TEXT,
    created_at DATETIME NOT NULL,
    FOREIGN KEY(idea_id) REFERENCES ideas(id) ON DELETE CASCADE
);
```

---

## Code Quality & MCP Tooling

This project adheres to rigorous verification and code navigation standards:

* **CodeRabbit Pre-Commit Review:**
  ```bash
  cr review --uncommitted
  cr review --base main
  ```
* **Tree-Sitter Knowledge Graph (`code-review-graph` MCP):**
  Explores call sites, dependencies, and blast radius without scanning full directories.
* **Precision Symbol Navigation (`serena` MCP):**
  LSP-powered TypeScript AST navigation, refactoring, and diagnostic error checks.

---

## License

This project is licensed under the MIT License.
