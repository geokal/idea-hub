# Product Feedback & Idea Board — Specification

> **Context:** This spec is based on the internal email thread (Sarah Johnson, Mike Chen, David Park) and Sarah’s dashboard sketch. The guiding principle from leadership: keep it simple, low friction for customers, and ship something working quickly. Scope can expand in v2.

---

## Overview
A lightweight, public-facing feedback board where customers can submit ideas and feature requests, vote on existing ones, and track progress. The internal team uses a private dashboard view to triage submissions, add internal notes, update statuses, and communicate back to customers. This system consolidates feedback that currently arrives scattered across email, Twitter DMs, chat widgets, and LinkedIn.

---

## Goals
* Consolidate scattered customer feedback into one place (replacing ad-hoc emails, DMs, chat)
* Make it dead simple for customers to submit — minimal friction, no unnecessary barriers
* Give the team visibility into what customers actually want and what's most popular
* Help the team prioritise what to build based on real demand
* Be transparent with customers about where their ideas stand
* Avoid creating more internal work than it saves

---

## Technical Stack

The system is designed with a modern, high-performance, and developer-friendly architecture:

* **Frontend**:
  * **Angular 22** (Standalone Components, Signals-based reactive state, native control flow)
  * **Tailwind CSS v4** via PostCSS for lightweight utility-first styling
  * Clean editorial aesthetic (Playfair Display serif headers, Plus Jakarta Sans body, dark/light theme toggle)
* **Backend Architecture (Selected: Go Fiber)**:
  * **Go 1.24** with the **Fiber** web framework (`idea-hub-api`) & SQLite.
  * Fast HTTP routing, lightweight resource footprint, and type-safe RESTful API handlers.
  * *(Alternative considered: ASP.NET Core Minimal APIs for .NET ecosystem)*.
* **Database**:
  * **SQLite** with Write-Ahead Logging (`WAL`) enabled — zero configuration, file-based persistence, fast concurrency, and low overhead.
* **Architecture Note on Reference Stack (Laravel + Inertia.js + Vue.js)**:
  * The course video referenced Laravel with Inertia.js and Vue.js. In our implementation, we customized this to **Go Fiber + Angular 22**. Since Inertia.js does not provide an official Angular adapter, the Go Fiber backend provides clean, high-performance RESTful JSON endpoints (`/api/...`), and the Angular frontend consumes them with reactive Signals and `HttpClient`.

---

## Users & Roles

### Customer (External)
* Submits feedback/ideas via email verification (no password account required — see Authentication)
* Views the public feedback board without logging in
* Votes/upvotes ideas (requires email verification)
* Receives email notifications when their submission's status changes
* Submitter identity (name/display name) is visible publicly, but their email address is visible to the team only and **not** shown publicly

### Team Member (Internal)
* Views all submitted ideas
* Adds internal (private) comments visible only to the team
* Adds external (public) comments visible to customers
* Updates the status of any idea
* Manages and moderates submissions (edit, merge, archive, delete)

### Admin
* All Team Member permissions
* Manages user accounts and roles
* Configures status labels, categories, and notification templates

---

## Core Features

### 1. Feedback Submission (Customer-Facing)
**Design principle:** Minimum possible friction. Customers should be able to submit in under a minute.

* Submission form fields:
  * **Title** (required, max 120 characters)
  * **Description** (required, plain text, max 2000 characters)
  * **Email address** (required — used for verification and follow-up; not shown publicly)
  * **Name or display name** (required — shown publicly on the board entry)
* No password account required. On submission:
  1. A verification email is sent to the provided address
  2. The submission is held as pending until the customer clicks the confirmation link
  3. Once verified, the submission appears live on the public board
* This email verification approach prevents spam without creating account friction while still identifying real submitters
* Duplicate detection: system surfaces visually similar existing submissions before customer finalises, with a prompt to upvote the existing one instead
* Rate limiting: max 3 unverified submissions per email address per 24 hour period

### 2. Public Feedback Board
The board is a clean list/table layout directly implementing Sarah’s wireframe sketch:

| Column | Details |
| :--- | :--- |
| **Vote count** | Displayed prominently on the left as a number in a box (e.g. `35`, `20`, `15`, `42`) |
| **Title** | Clickable, links to the detail page |
| **Short description** | One-line summary of the submission |
| **Status badge** | Colour-coded pill: `Under Review`, `Planned`, `In Progress`, `Completed`, `Declined` |

* Visible to anyone without logging in (browse-only)
* Email verification required to vote or submit
* Sorted by vote count by default; also sortable by date submitted
* Filterable by status badge
* Searchable by keyword
* Vote counts are shown publicly (makes popular ideas visible at a glance)

### 3. Idea Detail Page
* Full description and any attachments
* Current status with a plain-English explanation (configured per status by Admin)
* Vote/upvote button (one per customer account)
* Public comment thread (chronological)
* Submission date and submitting customer's display name

### 4. Voting
* One upvote per customer per idea
* Vote counts are public
* Team uses vote counts as one signal for prioritisation; vote count alone does not guarantee action

### 5. Commenting

**External (Public) Comments**
* Visible to all users on the idea detail page
* Can be posted by customers or team members
* Team member comments are visually distinguished (e.g. "Team" badge)
* Supports mentions (@username) and basic markdown formatting
* Customers are notified via email when a team member replies to their idea

**Internal (Private) Comments**
* Visible only to authenticated Team Members and Admins in the internal dashboard
* Used for triage notes, stakeholder discussions, links to tickets, etc.
* Never exposed through any public API or page
* Clearly labelled as internal in the UI

### 6. Customer Notifications
Customers receive email notifications for:
* Idea successfully submitted (confirmation)
* Status change on their own idea
* A team member posts a public comment on their idea
* (Optional, opt-in) Status change on any idea they have upvoted

Notification emails include:
* Idea title and current status
* The public note from the team (if provided)
* A direct link back to the idea
* One-click unsubscribe link

#### Email Templates

**Status Transition Notification Template**
```text
Subject: Update on your feedback: {{ideaTitle}}

Hi {{customerDisplayName}},

Great news! The status of your feedback "{{ideaTitle}}" has been updated to [ {{newStatus}} ].

Note from the team:
"{{publicNote}}"

View the feedback and progress on the board:
{{ideaUrl}}

---
You are receiving this update because you submitted or upvoted this idea on the Feedback Dashboard.
Preferences: Unsubscribe from this idea | Manage notification preferences
```

**Team Member Comment Notification Template**
```text
Subject: The team replied to your feedback: {{ideaTitle}}

Hi {{customerDisplayName}},

A team member just replied to your feedback:

"{{commentSnippet}}"

Join the discussion here:
{{ideaUrl}}
```

### 7. Internal Dashboard
Available to Team Members and Admins only:
* Full idea list with internal filters (e.g. show ideas with no status, show ideas with internal comments awaiting action)
* Bulk actions: change status, assign category, archive, merge
* Merge: combine duplicate ideas, redirecting voters and comments to the canonical idea
* Internal comment thread per idea (alongside external thread)
* Activity log per idea (status changes, merges, comment events with timestamps and actor)
* Export to CSV (idea title, category, status, vote count, submission date, submitter email)

---

## Data Model (Simplified)

### Idea
* `id`, `title`, `description`, `category_id`, `status_id`
* `submitter_id` (Customer)
* `created_at`, `updated_at`
* `merged_into_id` (nullable)
* `attachments[]`

### Status
* `id`, `label`, `description` (public-facing explanation), `colour`

### Comment
* `id`, `idea_id`, `author_id`, `body`
* `is_internal` (boolean)
* `created_at`, `updated_at`

### Vote
* `id`, `idea_id`, `voter_id`, `created_at`

### StatusChange (Audit log)
* `id`, `idea_id`, `changed_by_id`
* `from_status_id`, `to_status_id`
* `public_note` (nullable)
* `created_at`

### User
* `id`, `email`, `display_name`, `role` (`customer` | `team` | `admin`)
* `notification_preferences`

---

## Authentication & Access Control

### Customers
* **No password account required.** Customers are identified by a verified email address only.
* On submission or voting, customers enter their email; a one-time magic link is sent for verification.
* A verified session cookie allows them to vote and track their submissions for 30 days without re-verifying.
* Submitter name and email are stored server-side and visible in the internal dashboard but are **never exposed publicly**.

### Team Members & Admins
* Standard email/password login with secure password reset
* Session-based auth with CSRF protection
* Role-based access: all internal dashboard routes require `team` or `admin` role
* Internal comments must never be returned in any public API response

---

## Notifications Architecture
* Notification events are queued asynchronously (do not block the UI action)
* Transactional email provider (e.g. SendGrid, Postmark) handles delivery
* All outbound emails honour the customer's notification preferences
* Unsubscribe links use signed tokens (not customer IDs) to prevent enumeration

---

## Non-Functional Requirements
* **Performance:** Idea board and detail pages load in under 2 seconds (p95) with up to 10,000 ideas
* **Availability:** 99.9% uptime SLA
* **Security:** No internal data exposed publicly; all inputs sanitised; rate limiting on submission and voting endpoints
* **Accessibility:** WCAG 2.1 AA compliance on all customer-facing pages
* **Internationalisation:** UTF-8 throughout; date/time displayed in user's local timezone

---

## Out of Scope (v1)
Ship something basic and working, not perfect. These are explicitly deferred:
* Native mobile apps (responsive web only)
* In-app notifications (email only)
* Public API for third-party integrations
* SSO / OAuth login (not raised as a requirement)
* Attachments on submissions (adds complexity)
* Rich text / markdown in submissions (plain text for v1)
* AI-powered duplicate detection or clustering
* Integration with Jira, Linear, or other PM tools
* Categories/tagging (can be added in v2 based on volume)

---

## Decisions Made
These questions were raised during scoping and have been resolved in this spec:

| Question | Decision |
| :--- | :--- |
| Should customers need accounts? | No — email verification only, no passwords |
| Should vote counts be public? | Yes — displayed on the board |
| Should statuses be visible to customers? | Yes — shown as badges on the board |
| Who can update statuses? | Any team member (Admin can restrict if needed) |
| Should we email customers on status changes? | Yes |
| Is this replacing the support system? | No — feature requests and ideas only, not support |
| How to prevent spam without accounts? | Email verification before submission goes live |

---

## Open Questions
The following still need a decision before or during build:

1. **Voter notifications:** When a status changes, should we also notify everyone who upvoted — not just the submitter? (opt-in vs. opt-out)
2. **Moderation queue:** Should submissions go live immediately after email verification, or should a team member approve them first?
3. **Categories:** Does the team want to categorise submissions (e.g. Bug, Feature Request, UI/UX), or start with a single flat list and add later?
4. **Declined visibility:** Should declined submissions remain visible on the public board or be hidden? (Currently spec'd as visible with a Declined badge)
5. **Status update permissions:** Should all team members be able to change statuses, or should this be restricted to specific roles? (Currently open; Admin can configure if needed)
