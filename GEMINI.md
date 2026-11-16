# GEMINI.md — Workspace Guidelines & Architecture

Welcome to the **IdeaHub** (Product Idea & Feedback System) workspace. This document outlines project architecture, coding standards, and best practices for developing, reviewing, and navigating code across this repository.

---

## 1. Workspace Layout

The workspace is organized into a modern Angular client and a lightweight Go REST API:

```
├── idea-hub/               # Product Idea & Feedback System (Angular 22 + Tailwind CSS v4)
│   ├── src/app/
│   │   ├── components/     # Standalone components (header, idea-card, idea-submit, idea-toolbar, idea-detail)
│   │   ├── models/         # TypeScript interfaces (ProductIdea, Comment, InternalTeamNote, UserRole)
│   │   └── services/       # Reactive services using Angular Signals & HttpClient (idea.service, theme.service)
│   ├── SPEC.MD             # Product & Architectural Specification (Sarah's Feedback Dashboard)
│   └── package.json        # Dependencies (pnpm, Angular 22, Tailwind v4)
│
├── idea-hub-api/           # RESTful Backend API (Go 1.24 + Fiber v2 + SQLite)
│   ├── cmd/api/main.go     # Fiber server entrypoint with CORS (port :8080)
│   ├── internal/
│   │   ├── database/db.go  # SQLite schema initialization (WAL mode) & seed data
│   │   └── handlers/       # REST handlers for ideas, comments, voting, status updates, CSV export
│   ├── go.mod / go.sum     # Pinned stable Go dependencies (fiber/v2 v2.52.5, go-sqlite3, uuid)
│   └── feedback.db         # Local SQLite database file (WAL journaled, git-ignored)
│
├── README.md               # Complete project documentation & setup guide
└── GEMINI.md               # Workspace guidelines (this file)
```

> **Note on Workspace Location:** The workspace is currently located at `C:\Users\bigbu\source\repos\todoapp\`. Paths within tools should target `idea-hub` and `idea-hub-api` without relying on legacy todo application references. In future reorganization, the repository may be relocated to `C:\Users\bigbu\source\repos\idea-hub\`.

---

## 2. MCP Tools: Mandatory Exploration & Review Protocols

This project is configured with specialized MCP servers. **Always prioritize MCP tools before fallback to text searches (grep/find).**

### A. `code-review-graph` MCP Tools (Priority 1 for Exploration & Changes)
Always use `code-review-graph` MCP tools before Grep/Glob/Read when exploring codebase structure, dependencies, and blast radius:

| Task | Preferred MCP Tool | Description |
|---|---|---|
| **Code Exploration** | `semantic_search_nodes_tool` or `query_graph_tool` | Fast, token-efficient semantic lookup of functions and classes |
| **Change Review** | `detect_changes_tool` + `get_review_context_tool` | Analyzes diffs with risk scoring and minimal source snippets |
| **Impact Radius** | `get_impact_radius_tool` | Calculates blast radius without manually tracing imports |
| **Execution Flows** | `get_affected_flows_tool` | Determines which execution paths are impacted by edits |
| **Graph Queries** | `query_graph_tool` | Traces `callers_of`, `callees_of`, `imports_of`, `tests_for` |
| **Architecture** | `get_architecture_overview_tool`, `list_communities_tool` | Understands system architecture and module clustering |

### B. `serena` MCP Tools (Priority for Symbol Navigation & Refactoring)
Use `serena` for precision symbol navigation, editing, and persistent agent memory:

| Task | Serena MCP Tool |
|---|---|
| **Find Symbol / Hierarchy** | `find_symbol`, `get_symbols_overview`, `find_declaration` |
| **References & Implementations**| `find_referencing_symbols`, `find_implementations` |
| **Safe Refactoring** | `replace_symbol_body`, `insert_after_symbol`, `insert_before_symbol`, `rename_symbol` |
| **Diagnostic Checks** | `get_diagnostics_for_file` |
| **Project Memory** | `write_memory`, `read_memory`, `list_memories` |

---

## 3. CodeRabbit CLI (`cr`) Pre-Commit Verification

CodeRabbit is installed natively on Windows:
* **Binary Path:** `C:\Users\bigbu\AppData\Local\Programs\coderabbit\cr.exe`
* **Version:** `0.9.5+`

### How to Run CodeRabbit Reviews:
```bash
# Review committed changes against main branch:
cr review --base main

# Review uncommitted (staged/unstaged) working-tree edits:
cr review --uncommitted

# Review with structured output for AI agents:
cr review --agent --base main

# Quality gate: exit code 2 if major or critical findings are detected:
cr review --agent --gate major --base main
```

---

## 4. Technology Stack & Coding Standards

### Frontend (`idea-hub`):
* **Framework:** Angular 22 (Standalone Components only; no NgModules).
* **State Management:** Angular Signals (`signal()`, `computed()`, `effect()`).
* **Styling:** Tailwind CSS v4 with PostCSS. Warm editorial paper palette (`#F8F7F4`), serif headings (`Playfair Display`), sans-serif UI (`Plus Jakarta Sans`), with full Dark Mode support (`class="dark"`).
* **Icons:** Inline SVG and Lucide Angular icons.
* **Component Design:** Clean separation of concerns; inputs/outputs via `input()` and `output()` Signal APIs.

### Backend (`idea-hub-api`):
* **Language & Runtime:** Go 1.24 (Windows amd64 with MinGW GCC for CGO).
* **Framework:** Go Fiber v2 (`github.com/gofiber/fiber/v2`).
* **Database:** SQLite with Write-Ahead Logging (`PRAGMA journal_mode=WAL;`).
* **API Architecture:** RESTful JSON endpoints with CORS enabled for `http://localhost:4300`.
* **Data Protection:** Internal comments (`is_internal = true`) and customer emails are **never** exposed on public unauthenticated endpoints.

---

## 5. Development Workflows & Commands

### Angular Frontend (`idea-hub`):
```bash
cd idea-hub
pnpm install          # Install dependencies
pnpm run build        # Production build verification
pnpm start            # Run dev server on http://localhost:4300
```

### Go Backend (`idea-hub-api`):
```bash
cd idea-hub-api
go mod tidy           # Verify and resolve dependencies
go build -v ./cmd/api # Compile backend binary
go run ./cmd/api      # Run API server on http://localhost:8080
```

### Git & Review Workflow:
```bash
git checkout -b feature/<feature-name>
# Make changes...
git add .
cr review --uncommitted          # Run CodeRabbit pre-commit check
git commit -m "feat: <description>"
cr review --base main            # Verify branch diff against main
```
