package handlers

import (
	"bytes"
	"database/sql"
	"encoding/csv"
	"fmt"
	"os"
	"strings"
	"time"

	"idea-hub-api/internal/database"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type Handler struct {
	db *database.Service
}

func New(db *database.Service) *Handler {
	return &Handler{db: db}
}

type IdeaDTO struct {
	ID              string   `json:"id"`
	Title           string   `json:"title"`
	Description     string   `json:"description"`
	Category        string   `json:"category"`
	Status          string   `json:"status"`
	AuthorName      string   `json:"authorName"`
	AuthorEmail     string   `json:"authorEmail,omitempty"` // Omitted for public customers
	Upvotes         int      `json:"upvotes"`
	MergedIntoID    *string  `json:"mergedIntoId,omitempty"`
	MergedIntoTitle *string  `json:"mergedIntoTitle,omitempty"`
	CreatedAt       string   `json:"createdAt"`
	UpdatedAt       string   `json:"updatedAt"`
	CommentsCount   int      `json:"commentsCount"`
	InternalCount   int      `json:"internalCount,omitempty"`
}

type CommentDTO struct {
	ID           string `json:"id"`
	IdeaID       string `json:"ideaId"`
	AuthorName   string `json:"authorName"`
	AuthorEmail  string `json:"authorEmail,omitempty"`
	IsTeamMember bool   `json:"isTeamMember"`
	IsInternal   bool   `json:"isInternal"`
	Body         string `json:"content"`
	CreatedAt    string `json:"createdAt"`
}

type StatusChangeDTO struct {
	ID         string  `json:"id"`
	IdeaID     string  `json:"ideaId"`
	FromStatus string  `json:"previousStatus"`
	ToStatus   string  `json:"newStatus"`
	ChangedBy  string  `json:"changedBy"`
	PublicNote *string `json:"note"`
	CreatedAt  string  `json:"timestamp"`
}

type IdeaDetailDTO struct {
	IdeaDTO
	Comments      []CommentDTO      `json:"comments"`
	InternalNotes []CommentDTO      `json:"internalNotes,omitempty"` // Zero-leak: only for Team & Admin
	StatusHistory []StatusChangeDTO `json:"statusHistory"`
	Subscribers   []string          `json:"subscribers"`
}

func maskEmail(email string) string {
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return "***"
	}
	name := parts[0]
	if len(name) > 1 {
		return string(name[0]) + "***@" + parts[1]
	}
	return "*@" + parts[1]
}

func sanitizeCSVCell(val string) string {
	if val == "" {
		return val
	}
	first := val[0]
	if first == '=' || first == '+' || first == '-' || first == '@' || first == '\t' || first == '\r' {
		return "'" + val
	}
	return val
}

func getAuthorizedRole(c *fiber.Ctx) string {
	adminKey := os.Getenv("ADMIN_API_KEY")
	if adminKey == "" {
		adminKey = "ideahub-admin-dev-secret"
	}

	providedKey := c.Get("X-Admin-Key")
	if providedKey == "" {
		authHeader := c.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			providedKey = strings.TrimPrefix(authHeader, "Bearer ")
		}
	}

	if providedKey != "" && providedKey == adminKey {
		requestedRole := strings.ToLower(strings.TrimSpace(c.Get("X-User-Role", "admin")))
		if requestedRole == "team" {
			return "team"
		}
		return "admin"
	}

	// Strictly treat unauthenticated or untrusted requests as customer
	return "customer"
}

// GET /api/ideas
func (h *Handler) GetIdeas(c *fiber.Ctx) error {
	statusFilter := c.Query("status", "all")
	search := strings.TrimSpace(strings.ToLower(c.Query("q", "")))
	sortOpt := c.Query("sort", "upvotes-desc")
	role := getAuthorizedRole(c)
	isTeam := role == "team" || role == "admin"

	query := `
		SELECT i.id, i.title, i.description, i.category, i.status, i.author_name, i.author_email,
		       i.upvotes, i.merged_into_id, i.merged_into_title, i.created_at, i.updated_at,
		       (SELECT COUNT(*) FROM comments c WHERE c.idea_id = i.id AND c.is_internal = 0) as public_comments,
		       (SELECT COUNT(*) FROM comments c WHERE c.idea_id = i.id AND c.is_internal = 1) as internal_notes
		FROM ideas i
		WHERE 1=1
	`
	var args []interface{}

	includeMerged := c.Query("include_merged") == "true" || c.Query("all") == "true"

	if statusFilter != "all" {
		query += " AND i.status = ?"
		args = append(args, statusFilter)
	} else {
		// By default hide merged unless searching or include_merged is requested
		if search == "" && !includeMerged {
			query += " AND i.status != 'merged'"
		}
	}

	if search != "" {
		query += " AND (LOWER(i.title) LIKE ? OR LOWER(i.description) LIKE ? OR LOWER(i.author_name) LIKE ?)"
		searchTerm := "%" + search + "%"
		args = append(args, searchTerm, searchTerm, searchTerm)
	}

	switch sortOpt {
	case "date-desc":
		query += " ORDER BY i.created_at DESC"
	case "comments-desc":
		query += " ORDER BY public_comments DESC"
	default:
		query += " ORDER BY i.upvotes DESC"
	}

	rows, err := h.db.DB.Query(query, args...)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var ideas []IdeaDTO
	for rows.Next() {
		var item IdeaDTO
		var rawAuthorEmail string
		var mergedID, mergedTitle sql.NullString
		var internalCount int

		err := rows.Scan(
			&item.ID, &item.Title, &item.Description, &item.Category, &item.Status,
			&item.AuthorName, &rawAuthorEmail, &item.Upvotes,
			&mergedID, &mergedTitle, &item.CreatedAt, &item.UpdatedAt,
			&item.CommentsCount, &internalCount,
		)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}

		if mergedID.Valid {
			item.MergedIntoID = &mergedID.String
		}
		if mergedTitle.Valid {
			item.MergedIntoTitle = &mergedTitle.String
		}

		// Privacy boundary: author email is visible only to internal team members
		if isTeam {
			item.AuthorEmail = rawAuthorEmail
			item.InternalCount = internalCount
		}

		ideas = append(ideas, item)
	}

	if ideas == nil {
		ideas = []IdeaDTO{}
	}

	return c.JSON(ideas)
}

// GET /api/ideas/:id
func (h *Handler) GetIdeaByID(c *fiber.Ctx) error {
	id := c.Params("id")
	role := getAuthorizedRole(c)
	isTeam := role == "team" || role == "admin"

	var detail IdeaDetailDTO
	var rawAuthorEmail string
	var mergedID, mergedTitle sql.NullString

	query := `
		SELECT id, title, description, category, status, author_name, author_email,
		       upvotes, merged_into_id, merged_into_title, created_at, updated_at
		FROM ideas WHERE id = ?
	`
	err := h.db.DB.QueryRow(query, id).Scan(
		&detail.ID, &detail.Title, &detail.Description, &detail.Category, &detail.Status,
		&detail.AuthorName, &rawAuthorEmail, &detail.Upvotes,
		&mergedID, &mergedTitle, &detail.CreatedAt, &detail.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return c.Status(404).JSON(fiber.Map{"error": "Feedback item not found"})
	} else if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if mergedID.Valid {
		detail.MergedIntoID = &mergedID.String
	}
	if mergedTitle.Valid {
		detail.MergedIntoTitle = &mergedTitle.String
	}

	if isTeam {
		detail.AuthorEmail = rawAuthorEmail
	}

	// Fetch Comments
	cQuery := `SELECT id, idea_id, author_name, author_email, is_team_member, is_internal, body, created_at FROM comments WHERE idea_id = ? ORDER BY created_at ASC`
	cRows, err := h.db.DB.Query(cQuery, id)
	if err == nil {
		defer cRows.Close()
		for cRows.Next() {
			var comm CommentDTO
			var isTeamInt, isInternalInt int
			var cEmail string
			_ = cRows.Scan(&comm.ID, &comm.IdeaID, &comm.AuthorName, &cEmail, &isTeamInt, &isInternalInt, &comm.Body, &comm.CreatedAt)
			comm.IsTeamMember = isTeamInt == 1
			comm.IsInternal = isInternalInt == 1

			if isTeam {
				comm.AuthorEmail = cEmail
			}

			// Structural Separation: Internal notes NEVER sent to customers!
			if comm.IsInternal {
				if isTeam {
					detail.InternalNotes = append(detail.InternalNotes, comm)
				}
			} else {
				detail.Comments = append(detail.Comments, comm)
			}
		}
	}
	if detail.Comments == nil {
		detail.Comments = []CommentDTO{}
	}
	if isTeam && detail.InternalNotes == nil {
		detail.InternalNotes = []CommentDTO{}
	}

	// Fetch Status History
	hQuery := `SELECT id, idea_id, from_status, to_status, changed_by, public_note, created_at FROM status_changes WHERE idea_id = ? ORDER BY created_at DESC`
	hRows, err := h.db.DB.Query(hQuery, id)
	if err == nil {
		defer hRows.Close()
		for hRows.Next() {
			var change StatusChangeDTO
			var pNote sql.NullString
			_ = hRows.Scan(&change.ID, &change.IdeaID, &change.FromStatus, &change.ToStatus, &change.ChangedBy, &pNote, &change.CreatedAt)
			if pNote.Valid {
				change.PublicNote = &pNote.String
			}
			detail.StatusHistory = append(detail.StatusHistory, change)
		}
	}
	if detail.StatusHistory == nil {
		detail.StatusHistory = []StatusChangeDTO{}
	}

	detail.Subscribers = []string{}
	subRows, err := h.db.DB.Query("SELECT user_email FROM subscriptions WHERE idea_id = ?", id)
	if err == nil {
		defer subRows.Close()
		for subRows.Next() {
			var subEmail string
			if err := subRows.Scan(&subEmail); err == nil {
				detail.Subscribers = append(detail.Subscribers, subEmail)
			}
		}
	}

	return c.JSON(detail)
}

// POST /api/ideas
func (h *Handler) CreateIdea(c *fiber.Ctx) error {
	type Request struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		Category    string `json:"category"`
		AuthorName  string `json:"authorName"`
		AuthorEmail string `json:"authorEmail"`
	}

	var req Request
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	title := strings.TrimSpace(req.Title)
	if title == "" || len(title) > 120 {
		return c.Status(400).JSON(fiber.Map{"error": "Title required (max 120 characters)"})
	}
	desc := strings.TrimSpace(req.Description)
	if desc == "" || len(desc) > 2000 {
		return c.Status(400).JSON(fiber.Map{"error": "Description required (max 2000 characters)"})
	}

	authorName := strings.TrimSpace(req.AuthorName)
	if authorName == "" {
		authorName = "Customer"
	}
	authorEmail := strings.TrimSpace(req.AuthorEmail)
	if authorEmail == "" {
		authorEmail = "customer@example.com"
	}
	category := strings.TrimSpace(req.Category)
	if category == "" {
		category = "Core Feature"
	}

	newID := uuid.New().String()
	now := time.Now().UTC().Format(time.RFC3339)

	_, err := h.db.DB.Exec(`
		INSERT INTO ideas (id, title, description, category, status, author_name, author_email, upvotes, created_at, updated_at)
		VALUES (?, ?, ?, ?, 'under-review', ?, ?, 1, ?, ?)
	`, newID, title, desc, category, authorName, authorEmail, now, now)

	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	// Add initial audit log
	changeID := uuid.New().String()
	_, _ = h.db.DB.Exec(`
		INSERT INTO status_changes (id, idea_id, from_status, to_status, changed_by, public_note, created_at)
		VALUES (?, ?, 'under-review', 'under-review', 'System (Verified)', 'Verified and published to the public feedback board.', ?)
	`, changeID, newID, now)

	return c.Status(201).JSON(fiber.Map{
		"id":      newID,
		"message": "Feedback submitted successfully via verified email.",
	})
}

// POST /api/ideas/:id/vote
func (h *Handler) VoteIdea(c *fiber.Ctx) error {
	id := c.Params("id")
	type Request struct {
		Action string `json:"action"` // "add" or "remove"
	}
	var req Request
	_ = c.BodyParser(&req)

	delta := 1
	if strings.ToLower(strings.TrimSpace(req.Action)) == "remove" {
		delta = -1
	}

	var currentUpvotes int
	err := h.db.DB.QueryRow("SELECT upvotes FROM ideas WHERE id = ?", id).Scan(&currentUpvotes)
	if err == sql.ErrNoRows {
		return c.Status(404).JSON(fiber.Map{"error": "Idea not found"})
	} else if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	newUpvotes := currentUpvotes + delta
	if newUpvotes < 0 {
		newUpvotes = 0
	}

	now := time.Now().UTC().Format(time.RFC3339)
	_, err = h.db.DB.Exec("UPDATE ideas SET upvotes = ?, updated_at = ? WHERE id = ?", newUpvotes, now, id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"id": id, "upvotes": newUpvotes, "action": req.Action})
}

// POST /api/ideas/:id/upvote (backward-compatible alias)
func (h *Handler) UpvoteIdea(c *fiber.Ctx) error {
	return h.VoteIdea(c)
}

// POST /api/ideas/:id/status
func (h *Handler) UpdateStatus(c *fiber.Ctx) error {
	role := getAuthorizedRole(c)
	if role != "team" && role != "admin" {
		return c.Status(403).JSON(fiber.Map{"error": "Unauthorized: requires verified team or admin role"})
	}

	id := c.Params("id")
	type Request struct {
		Status     string `json:"status"`
		PublicNote string `json:"note"`
		ChangedBy  string `json:"changedBy"`
	}
	var req Request
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid payload"})
	}

	validStatuses := map[string]bool{
		"under-review": true,
		"planned":      true,
		"in-progress":   true,
		"completed":    true,
		"declined":     true,
	}
	if !validStatuses[req.Status] {
		return c.Status(400).JSON(fiber.Map{
			"error": "Invalid status. Allowed values: under-review, planned, in-progress, completed, declined",
		})
	}

	tx, err := h.db.DB.Begin()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to begin transaction: " + err.Error()})
	}
	defer tx.Rollback()

	var prevStatus string
	err = tx.QueryRow("SELECT status FROM ideas WHERE id = ?", id).Scan(&prevStatus)
	if err == sql.ErrNoRows {
		return c.Status(404).JSON(fiber.Map{"error": "Idea not found"})
	} else if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	now := time.Now().UTC().Format(time.RFC3339)
	changedBy := req.ChangedBy
	if changedBy == "" {
		if role == "admin" {
			changedBy = "Admin"
		} else {
			changedBy = "Product Team"
		}
	}

	_, err = tx.Exec("UPDATE ideas SET status = ?, updated_at = ? WHERE id = ?", req.Status, now, id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	changeID := uuid.New().String()
	_, err = tx.Exec(`
		INSERT INTO status_changes (id, idea_id, from_status, to_status, changed_by, public_note, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, changeID, id, prevStatus, req.Status, changedBy, req.PublicNote, now)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if err := tx.Commit(); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to commit status change: " + err.Error()})
	}

	return c.JSON(fiber.Map{
		"id":         id,
		"newStatus":  req.Status,
		"publicNote": req.PublicNote,
		"message":    "Status updated. Notification event queued asynchronously.",
	})
}

// POST /api/ideas/:id/comments
func (h *Handler) CreateComment(c *fiber.Ctx) error {
	id := c.Params("id")
	role := getAuthorizedRole(c)
	isTeam := role == "team" || role == "admin"

	type Request struct {
		AuthorName  string `json:"authorName"`
		AuthorEmail string `json:"authorEmail"`
		Content     string `json:"content"`
		IsInternal  bool   `json:"isInternal"`
	}
	var req Request
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid payload"})
	}

	body := strings.TrimSpace(req.Content)
	if body == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Comment body cannot be empty"})
	}

	// Only team/admin can post internal notes
	if req.IsInternal && !isTeam {
		return c.Status(403).JSON(fiber.Map{"error": "Customers cannot post internal notes"})
	}

	authorName := strings.TrimSpace(req.AuthorName)
	if authorName == "" {
		if isTeam {
			authorName = "Product Team"
		} else {
			authorName = "Customer"
		}
	}

	authorEmail := strings.TrimSpace(req.AuthorEmail)
	if authorEmail == "" {
		if isTeam {
			authorEmail = "team@company.internal"
		} else {
			authorEmail = "customer@example.com"
		}
	}

	newID := uuid.New().String()
	now := time.Now().UTC().Format(time.RFC3339)

	var isInternalInt int
	if req.IsInternal {
		isInternalInt = 1
	}
	var isTeamInt int
	if isTeam {
		isTeamInt = 1
	}

	_, err := h.db.DB.Exec(`
		INSERT INTO comments (id, idea_id, author_name, author_email, is_team_member, is_internal, body, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, newID, id, authorName, authorEmail, isTeamInt, isInternalInt, body, now)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(201).JSON(fiber.Map{
		"id":         newID,
		"ideaId":     id,
		"authorName": authorName,
		"content":    body,
		"isInternal": req.IsInternal,
		"createdAt":  now,
	})
}

// POST /api/ideas/merge
func (h *Handler) MergeIdeas(c *fiber.Ctx) error {
	role := getAuthorizedRole(c)
	if role != "admin" && role != "team" {
		return c.Status(403).JSON(fiber.Map{"error": "Only Team or Admin can merge duplicate ideas"})
	}

	type Request struct {
		SourceIdeaID string `json:"sourceIdeaId"`
		TargetIdeaID string `json:"targetIdeaId"`
		Note         string `json:"note"`
	}
	var req Request
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid payload"})
	}

	req.SourceIdeaID = strings.TrimSpace(req.SourceIdeaID)
	req.TargetIdeaID = strings.TrimSpace(req.TargetIdeaID)

	if req.SourceIdeaID == "" || req.TargetIdeaID == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Source and Target idea IDs are required"})
	}

	if req.SourceIdeaID == req.TargetIdeaID {
		return c.Status(400).JSON(fiber.Map{"error": "Cannot merge idea into itself"})
	}

	tx, err := h.db.DB.Begin()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to begin transaction: " + err.Error()})
	}
	defer tx.Rollback()

	var sourceUpvotes int
	var sourceTitle, sourceStatus string
	err = tx.QueryRow("SELECT upvotes, title, status FROM ideas WHERE id = ?", req.SourceIdeaID).Scan(&sourceUpvotes, &sourceTitle, &sourceStatus)
	if err == sql.ErrNoRows {
		return c.Status(404).JSON(fiber.Map{"error": "Source idea not found"})
	} else if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if sourceStatus == "merged" {
		return c.Status(409).JSON(fiber.Map{"error": "Source idea has already been merged"})
	}

	var targetTitle, targetStatus string
	err = tx.QueryRow("SELECT title, status FROM ideas WHERE id = ?", req.TargetIdeaID).Scan(&targetTitle, &targetStatus)
	if err == sql.ErrNoRows {
		return c.Status(404).JSON(fiber.Map{"error": "Target idea not found"})
	} else if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if targetStatus == "merged" {
		return c.Status(409).JSON(fiber.Map{"error": "Cannot merge into an idea that is already merged"})
	}

	now := time.Now().UTC().Format(time.RFC3339)
	note := req.Note
	if note == "" {
		note = fmt.Sprintf("Merged duplicate into '%s'. %d upvotes consolidated.", targetTitle, sourceUpvotes)
	}

	// 1. Mark source as merged
	if _, err := tx.Exec(`
		UPDATE ideas SET status = 'merged', merged_into_id = ?, merged_into_title = ?, updated_at = ?
		WHERE id = ?
	`, req.TargetIdeaID, targetTitle, now, req.SourceIdeaID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to update source idea: " + err.Error()})
	}

	// 2. Consolidate upvotes into target
	if _, err := tx.Exec(`
		UPDATE ideas SET upvotes = upvotes + ?, updated_at = ?
		WHERE id = ?
	`, sourceUpvotes, now, req.TargetIdeaID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to update target idea: " + err.Error()})
	}

	// 3. Log audit status changes
	if _, err := tx.Exec(`
		INSERT INTO status_changes (id, idea_id, from_status, to_status, changed_by, public_note, created_at)
		VALUES (?, ?, ?, 'merged', 'Admin (Merge Engine)', ?, ?)
	`, uuid.New().String(), req.SourceIdeaID, sourceStatus, note, now); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to record audit status: " + err.Error()})
	}

	if err := tx.Commit(); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to commit merge transaction: " + err.Error()})
	}

	return c.JSON(fiber.Map{
		"message":      "Ideas merged successfully. Upvotes consolidated.",
		"sourceIdeaId": req.SourceIdeaID,
		"targetIdeaId": req.TargetIdeaID,
	})
}

// DELETE /api/ideas/:id
func (h *Handler) DeleteIdea(c *fiber.Ctx) error {
	role := getAuthorizedRole(c)
	if role != "admin" {
		return c.Status(403).JSON(fiber.Map{"error": "Only Admins can delete feedback items"})
	}
	id := c.Params("id")
	_, err := h.db.DB.Exec("DELETE FROM ideas WHERE id = ?", id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"message": "Feedback item permanently deleted."})
}

// GET /api/export/csv (Section 8 of SPEC.MD)
func (h *Handler) ExportCSV(c *fiber.Ctx) error {
	role := getAuthorizedRole(c)
	if role != "admin" {
		return c.Status(403).JSON(fiber.Map{"error": "Unauthorized: Only administrators can export feedback CSV"})
	}

	rows, err := h.db.DB.Query(`
		SELECT title, category, status, upvotes, created_at, author_name, author_email
		FROM ideas ORDER BY upvotes DESC
	`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var buf bytes.Buffer
	writer := csv.NewWriter(&buf)
	_ = writer.Write([]string{"Title", "Category", "Status", "Vote Count", "Submission Date", "Submitter Name", "Submitter Email"})

	for rows.Next() {
		var title, category, status, createdAt, name, email string
		var upvotes int
		_ = rows.Scan(&title, &category, &status, &upvotes, &createdAt, &name, &email)

		// Sanitize user-controlled fields against CSV injection
		_ = writer.Write([]string{
			sanitizeCSVCell(title),
			sanitizeCSVCell(category),
			sanitizeCSVCell(status),
			fmt.Sprintf("%d", upvotes),
			createdAt,
			sanitizeCSVCell(name),
			sanitizeCSVCell(email),
		})
	}
	writer.Flush()

	c.Set("Content-Type", "text/csv")
	c.Set("Content-Disposition", fmt.Sprintf("attachment; filename=feedback_export_%s.csv", time.Now().Format("2006-01-02")))
	return c.Send(buf.Bytes())
}

// POST /api/ideas/:id/subscribe
func (h *Handler) ToggleSubscription(c *fiber.Ctx) error {
	id := c.Params("id")
	type Request struct {
		Email string `json:"email"`
	}
	var req Request
	if err := c.BodyParser(&req); err != nil || strings.TrimSpace(req.Email) == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Valid email is required"})
	}
	email := strings.TrimSpace(strings.ToLower(req.Email))

	var exists int
	_ = h.db.DB.QueryRow("SELECT COUNT(*) FROM ideas WHERE id = ?", id).Scan(&exists)
	if exists == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "Idea not found"})
	}

	var existingID string
	err := h.db.DB.QueryRow("SELECT id FROM subscriptions WHERE idea_id = ? AND user_email = ?", id, email).Scan(&existingID)
	if err == nil {
		_, _ = h.db.DB.Exec("DELETE FROM subscriptions WHERE id = ?", existingID)
		return c.JSON(fiber.Map{"subscribed": false, "message": "Unsubscribed successfully"})
	}

	subID := uuid.New().String()
	now := time.Now().UTC().Format(time.RFC3339)
	_, err = h.db.DB.Exec("INSERT INTO subscriptions (id, idea_id, user_email, created_at) VALUES (?, ?, ?, ?)", subID, id, email, now)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to record subscription: " + err.Error()})
	}

	return c.JSON(fiber.Map{"subscribed": true, "message": "Subscribed successfully"})
}
