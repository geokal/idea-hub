package handlers

import (
	"bytes"
	"database/sql"
	"encoding/csv"
	"fmt"
	"os"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

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

func (h *Handler) resolveCanonicalIdeaID(id string) string {
	curr := id
	for depth := 0; depth < 10; depth++ {
		var status string
		var mergedIntoID sql.NullString
		err := h.db.DB.QueryRow("SELECT status, merged_into_id FROM ideas WHERE id = ?", curr).Scan(&status, &mergedIntoID)
		if err != nil {
			break
		}
		if status == "merged" && mergedIntoID.Valid && mergedIntoID.String != "" && mergedIntoID.String != curr {
			curr = mergedIntoID.String
		} else {
			break
		}
	}
	return curr
}

func (h *Handler) getMergeFamilyIDs(ideaID string) (canonicalID string, familyIDs []string) {
	canonicalID = h.resolveCanonicalIdeaID(ideaID)
	familyMap := map[string]bool{canonicalID: true, ideaID: true}

	// Find all ideas that merge into canonicalID directly or indirectly
	queue := []string{canonicalID}
	for len(queue) > 0 {
		curr := queue[0]
		queue = queue[1:]

		rows, err := h.db.DB.Query("SELECT id FROM ideas WHERE merged_into_id = ?", curr)
		if err == nil {
			for rows.Next() {
				var childID string
				if err := rows.Scan(&childID); err == nil && childID != "" {
					if !familyMap[childID] {
						familyMap[childID] = true
						queue = append(queue, childID)
					}
				}
			}
			rows.Close()
		}
	}

	familyIDs = make([]string, 0, len(familyMap))
	for id := range familyMap {
		familyIDs = append(familyIDs, id)
	}
	return canonicalID, familyIDs
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
		adminKey = os.Getenv("ADMIN_SECRET_KEY")
	}

	providedKey := c.Get("X-Admin-Key")
	if providedKey == "" {
		authHeader := c.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			providedKey = strings.TrimPrefix(authHeader, "Bearer ")
		}
	}

	// Strictly require a non-empty configured admin key and match before elevating
	if adminKey != "" && providedKey == adminKey {
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

	callerVoterKey := strings.TrimSpace(strings.ToLower(c.Get("X-Voter-Key")))

	// Fetch Comments
	cQuery := `SELECT id, idea_id, author_name, author_email, is_team_member, is_internal, body, created_at FROM comments WHERE idea_id = ? ORDER BY created_at ASC`
	cRows, err := h.db.DB.Query(cQuery, id)
	if err == nil {
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
		cRows.Close()
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
		for hRows.Next() {
			var change StatusChangeDTO
			var pNote sql.NullString
			_ = hRows.Scan(&change.ID, &change.IdeaID, &change.FromStatus, &change.ToStatus, &change.ChangedBy, &pNote, &change.CreatedAt)
			if pNote.Valid {
				change.PublicNote = &pNote.String
			}
			detail.StatusHistory = append(detail.StatusHistory, change)
		}
		hRows.Close()
	}
	if detail.StatusHistory == nil {
		detail.StatusHistory = []StatusChangeDTO{}
	}

	detail.Subscribers = []string{}
	canonicalID, familyIDs := h.getMergeFamilyIDs(id)
	subQuery := "SELECT user_email FROM subscriptions WHERE idea_id = ?"
	args := []interface{}{canonicalID}
	if len(familyIDs) > 1 {
		placeholders := make([]string, len(familyIDs))
		args = make([]interface{}, len(familyIDs))
		for i, fid := range familyIDs {
			placeholders[i] = "?"
			args[i] = fid
		}
		subQuery = fmt.Sprintf("SELECT user_email FROM subscriptions WHERE idea_id IN (%s)", strings.Join(placeholders, ","))
	}
	subRows, err := h.db.DB.Query(subQuery, args...)
	if err == nil {
		seen := make(map[string]bool)
		for subRows.Next() {
			var subEmail string
			if err := subRows.Scan(&subEmail); err == nil && subEmail != "" {
				normEmail := strings.ToLower(strings.TrimSpace(subEmail))
				if !seen[normEmail] {
					seen[normEmail] = true
					if isTeam {
						detail.Subscribers = append(detail.Subscribers, subEmail)
					} else if callerVoterKey != "" && strings.EqualFold(normEmail, callerVoterKey) {
						detail.Subscribers = append(detail.Subscribers, subEmail)
					}
				}
			}
		}
		subRows.Close()
	}

	return c.JSON(detail)
}

// POST /api/ideas
func (h *Handler) CreateIdea(c *fiber.Ctx) error {
	type Request struct {
		ID          string `json:"id"`
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
	if title == "" || utf8.RuneCountInString(title) > 120 {
		return c.Status(400).JSON(fiber.Map{"error": "Title required (max 120 characters)"})
	}
	desc := strings.TrimSpace(req.Description)
	if desc == "" || utf8.RuneCountInString(desc) > 2000 {
		return c.Status(400).JSON(fiber.Map{"error": "Description required (max 2000 characters)"})
	}

	authorName := strings.TrimSpace(req.AuthorName)
	if authorName == "" {
		authorName = "Customer"
	}
	authorEmail := strings.ToLower(strings.TrimSpace(req.AuthorEmail))
	emailRegex := regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
	if authorEmail == "" || !emailRegex.MatchString(authorEmail) {
		return c.Status(400).JSON(fiber.Map{"error": "A valid author email address is required"})
	}
	category := strings.TrimSpace(req.Category)
	if category == "" {
		category = "Core Feature"
	}

	newID := strings.TrimSpace(req.ID)
	if newID != "" {
		// Idempotency check: if already accepted, return existing item
		var existingID string
		err := h.db.DB.QueryRow("SELECT id FROM ideas WHERE id = ?", newID).Scan(&existingID)
		if err == nil && existingID != "" {
			return c.Status(200).JSON(fiber.Map{
				"id":      existingID,
				"message": "Feedback already recorded.",
			})
		}
	} else {
		newID = uuid.New().String()
	}

	now := time.Now().UTC().Format(time.RFC3339)

	tx, err := h.db.DB.Begin()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to begin transaction: " + err.Error()})
	}
	defer tx.Rollback()

	_, err = tx.Exec(`
		INSERT INTO ideas (id, title, description, category, status, author_name, author_email, upvotes, created_at, updated_at)
		VALUES (?, ?, ?, ?, 'under-review', ?, ?, 1, ?, ?)
	`, newID, title, desc, category, authorName, authorEmail, now, now)

	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	// Record initial author vote in votes table so the author can toggle/remove their upvote
	voterKey := strings.TrimSpace(c.Get("X-Voter-Key"))
	if voterKey == "" {
		voterKey = strings.ToLower(authorEmail)
	}
	voteID := uuid.New().String()
	_, _ = tx.Exec("INSERT OR IGNORE INTO votes (id, idea_id, voter_key, created_at) VALUES (?, ?, ?, ?)", voteID, newID, voterKey, now)

	// Record initial subscription for the author
	subID := uuid.New().String()
	_, _ = tx.Exec("INSERT OR IGNORE INTO subscriptions (id, idea_id, user_email, created_at) VALUES (?, ?, ?, ?)", subID, newID, strings.ToLower(authorEmail), now)

	// Add initial audit log
	changeID := uuid.New().String()
	_, _ = tx.Exec(`
		INSERT INTO status_changes (id, idea_id, from_status, to_status, changed_by, public_note, created_at)
		VALUES (?, ?, 'under-review', 'under-review', 'System (Verified)', 'Verified and published to the public feedback board.', ?)
	`, changeID, newID, now)

	if err := tx.Commit(); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to commit idea creation: " + err.Error()})
	}

	return c.Status(201).JSON(fiber.Map{
		"id":      newID,
		"message": "Feedback submitted successfully via verified email.",
	})
}

// POST /api/ideas/:id/vote
func (h *Handler) VoteIdea(c *fiber.Ctx) error {
	id := c.Params("id")
	type Request struct {
		Action   string `json:"action"`   // "add" or "remove"
		VoterKey string `json:"voterKey"` // unique voter identifier or email
	}
	var req Request
	_ = c.BodyParser(&req)

	voterKey := strings.TrimSpace(req.VoterKey)
	if voterKey == "" {
		voterKey = strings.TrimSpace(c.Get("X-Voter-Key"))
	}
	if voterKey == "" {
		voterKey = c.IP()
	}

	action := strings.ToLower(strings.TrimSpace(req.Action))
	if action != "remove" {
		action = "add"
	}

	tx, err := h.db.DB.Begin()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to begin vote transaction: " + err.Error()})
	}
	defer tx.Rollback()

	var currentUpvotes int
	var status string
	var mergedIntoID sql.NullString
	err = tx.QueryRow("SELECT upvotes, status, merged_into_id FROM ideas WHERE id = ?", id).Scan(&currentUpvotes, &status, &mergedIntoID)
	if err == sql.ErrNoRows {
		return c.Status(404).JSON(fiber.Map{"error": "Idea not found"})
	} else if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	targetIdeaID := id
	if status == "merged" {
		if mergedIntoID.Valid && mergedIntoID.String != "" {
			targetIdeaID = mergedIntoID.String
			err = tx.QueryRow("SELECT upvotes FROM ideas WHERE id = ?", targetIdeaID).Scan(&currentUpvotes)
			if err != nil {
				return c.Status(409).JSON(fiber.Map{"error": "This idea has been merged and the canonical idea could not be loaded"})
			}
		} else {
			return c.Status(409).JSON(fiber.Map{"error": "Cannot vote on a merged idea"})
		}
	}

	var existingVoteID string
	err = tx.QueryRow("SELECT id FROM votes WHERE idea_id = ? AND voter_key = ?", targetIdeaID, voterKey).Scan(&existingVoteID)
	hasVoted := err == nil

	newUpvotes := currentUpvotes
	now := time.Now().UTC().Format(time.RFC3339)

	if action == "add" {
		if !hasVoted {
			newVoteID := uuid.New().String()
			if _, err := tx.Exec("INSERT INTO votes (id, idea_id, voter_key, created_at) VALUES (?, ?, ?, ?)", newVoteID, targetIdeaID, voterKey, now); err != nil {
				return c.Status(500).JSON(fiber.Map{"error": "Failed to record vote: " + err.Error()})
			}
			newUpvotes = currentUpvotes + 1
			if _, err := tx.Exec("UPDATE ideas SET upvotes = ?, updated_at = ? WHERE id = ?", newUpvotes, now, targetIdeaID); err != nil {
				return c.Status(500).JSON(fiber.Map{"error": "Failed to update upvotes: " + err.Error()})
			}
		}
	} else if action == "remove" {
		if hasVoted {
			if _, err := tx.Exec("DELETE FROM votes WHERE id = ?", existingVoteID); err != nil {
				return c.Status(500).JSON(fiber.Map{"error": "Failed to delete vote: " + err.Error()})
			}
			newUpvotes = currentUpvotes - 1
			if newUpvotes < 0 {
				newUpvotes = 0
			}
			if _, err := tx.Exec("UPDATE ideas SET upvotes = ?, updated_at = ? WHERE id = ?", newUpvotes, now, targetIdeaID); err != nil {
				return c.Status(500).JSON(fiber.Map{"error": "Failed to update upvotes: " + err.Error()})
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to commit vote transaction: " + err.Error()})
	}

	return c.JSON(fiber.Map{
		"id":         targetIdeaID,
		"originalId": id,
		"upvotes":    newUpvotes,
		"action":     action,
		"hasVoted":   action == "add",
	})
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
	var prevMergedIntoID sql.NullString
	var sourceUpvotes int
	var authorEmail, ideaTitle string
	err = tx.QueryRow("SELECT status, merged_into_id, upvotes, author_email, title FROM ideas WHERE id = ?", id).Scan(&prevStatus, &prevMergedIntoID, &sourceUpvotes, &authorEmail, &ideaTitle)
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

	if prevStatus == "merged" && req.Status != "merged" {
		// Reopening a previously merged idea: reconcile upvotes, votes, and subscriptions
		if prevMergedIntoID.Valid && prevMergedIntoID.String != "" {
			// Deduct previously consolidated upvotes from the target idea
			_, err = tx.Exec(`
				UPDATE ideas
				SET upvotes = CASE WHEN upvotes >= ? THEN upvotes - ? ELSE 0 END, updated_at = ?
				WHERE id = ?
			`, sourceUpvotes, sourceUpvotes, now, prevMergedIntoID.String)
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": "Failed to reconcile target idea upvotes: " + err.Error()})
			}

			// Reconcile author vote: remove transferred vote from previous target
			if cleanAuthor := strings.ToLower(strings.TrimSpace(authorEmail)); cleanAuthor != "" {
				_, _ = tx.Exec("DELETE FROM votes WHERE idea_id = ? AND voter_key = ?", prevMergedIntoID.String, cleanAuthor)
			}
		}

		// Clear merge target links on the reopened idea
		_, err = tx.Exec("UPDATE ideas SET status = ?, merged_into_id = NULL, merged_into_title = NULL, updated_at = ? WHERE id = ?", req.Status, now, id)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}

		// Restore author vote on the reopened idea so it can be managed and tracked independently
		if cleanAuthor := strings.ToLower(strings.TrimSpace(authorEmail)); cleanAuthor != "" {
			voteID := uuid.New().String()
			_, _ = tx.Exec("INSERT OR IGNORE INTO votes (id, idea_id, voter_key, created_at) VALUES (?, ?, ?, ?)", voteID, id, cleanAuthor, now)

			// Restore author subscription on the reopened idea
			subID := uuid.New().String()
			_, _ = tx.Exec("INSERT OR IGNORE INTO subscriptions (id, idea_id, user_email, created_at) VALUES (?, ?, ?, ?)", subID, id, cleanAuthor, now)
		}
	} else {
		_, err = tx.Exec("UPDATE ideas SET status = ?, updated_at = ? WHERE id = ?", req.Status, now, id)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
	}

	changeID := uuid.New().String()
	_, err = tx.Exec(`
		INSERT INTO status_changes (id, idea_id, from_status, to_status, changed_by, public_note, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, changeID, id, prevStatus, req.Status, changedBy, req.PublicNote, now)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	// Persist server-side notification events for author and subscribers
	recipients := make(map[string]bool)
	if authorEmail != "" {
		recipients[strings.ToLower(strings.TrimSpace(authorEmail))] = true
	}
	subRows, err := tx.Query("SELECT user_email FROM subscriptions WHERE idea_id = ?", id)
	if err == nil {
		for subRows.Next() {
			var subEmail string
			if err := subRows.Scan(&subEmail); err == nil && subEmail != "" {
				recipients[strings.ToLower(strings.TrimSpace(subEmail))] = true
			}
		}
		subRows.Close()
	}

	notifMsg := fmt.Sprintf("Status changed to %s", req.Status)
	if req.PublicNote != "" {
		notifMsg = fmt.Sprintf("Status changed to %s: \"%s\"", req.Status, req.PublicNote)
	}

	for rEmail := range recipients {
		notifID := uuid.New().String()
		_, _ = tx.Exec(`
			INSERT INTO notifications (id, idea_id, recipient_email, event_type, title, message, status, created_at)
			VALUES (?, ?, ?, 'status_change', ?, ?, 'queued', ?)
		`, notifID, id, rEmail, ideaTitle, notifMsg, now)
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

	// Verify target idea exists to prevent orphaned discussions
	var exists int
	if err := h.db.DB.QueryRow("SELECT COUNT(*) FROM ideas WHERE id = ?", id).Scan(&exists); err != nil || exists == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "Idea not found"})
	}

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

	// If team posted a public comment, enqueue notification for author and subscribers
	if isTeam && !req.IsInternal {
		var ideaAuthorEmail, ideaTitle string
		_ = h.db.DB.QueryRow("SELECT author_email, title FROM ideas WHERE id = ?", id).Scan(&ideaAuthorEmail, &ideaTitle)

		recipients := make(map[string]bool)
		if ideaAuthorEmail != "" {
			recipients[strings.ToLower(strings.TrimSpace(ideaAuthorEmail))] = true
		}

		canonicalID, familyIDs := h.getMergeFamilyIDs(id)
		subQuery := "SELECT user_email FROM subscriptions WHERE idea_id = ?"
		args := []interface{}{canonicalID}
		if len(familyIDs) > 1 {
			placeholders := make([]string, len(familyIDs))
			args = make([]interface{}, len(familyIDs))
			for i, fid := range familyIDs {
				placeholders[i] = "?"
				args[i] = fid
			}
			subQuery = fmt.Sprintf("SELECT user_email FROM subscriptions WHERE idea_id IN (%s)", strings.Join(placeholders, ","))
		}
		subRows, err := h.db.DB.Query(subQuery, args...)
		if err == nil {
			for subRows.Next() {
				var subEmail string
				if err := subRows.Scan(&subEmail); err == nil && subEmail != "" {
					recipients[strings.ToLower(strings.TrimSpace(subEmail))] = true
				}
			}
			subRows.Close() // Explicitly close immediately to free the single database connection!
		}

		for rEmail := range recipients {
			notifID := uuid.New().String()
			_, _ = h.db.DB.Exec(`
				INSERT INTO notifications (id, idea_id, recipient_email, event_type, title, message, status, created_at)
				VALUES (?, ?, ?, 'team_reply', ?, ?, 'queued', ?)
			`, notifID, id, rEmail, ideaTitle, "Product team replied: "+body, now)
		}
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
	var sourceTitle, sourceStatus, sourceAuthorEmail string
	err = tx.QueryRow("SELECT upvotes, title, status, author_email FROM ideas WHERE id = ?", req.SourceIdeaID).Scan(&sourceUpvotes, &sourceTitle, &sourceStatus, &sourceAuthorEmail)
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

	// Flatten previous merge children of source idea to point directly to target idea
	if _, err := tx.Exec(`
		UPDATE ideas SET merged_into_id = ?, merged_into_title = ?, updated_at = ?
		WHERE merged_into_id = ?
	`, req.TargetIdeaID, targetTitle, now, req.SourceIdeaID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to flatten chained merge: " + err.Error()})
	}

	// 2. Consolidate votes avoiding double-counting:
	// Find all voters from source idea and its merged children
	vRows, err := tx.Query(`
		SELECT DISTINCT voter_key FROM votes
		WHERE idea_id = ? OR idea_id IN (SELECT id FROM ideas WHERE merged_into_id = ?)
	`, req.SourceIdeaID, req.SourceIdeaID)
	var sourceVoters []string
	if err == nil {
		for vRows.Next() {
			var vk string
			if err := vRows.Scan(&vk); err == nil && vk != "" {
				sourceVoters = append(sourceVoters, vk)
			}
		}
		vRows.Close()
	}

	if len(sourceVoters) == 0 && sourceAuthorEmail != "" {
		sourceVoters = append(sourceVoters, strings.ToLower(strings.TrimSpace(sourceAuthorEmail)))
	}

	newTransferredVotes := 0
	for _, vk := range sourceVoters {
		var exists int
		_ = tx.QueryRow("SELECT COUNT(*) FROM votes WHERE idea_id = ? AND voter_key = ?", req.TargetIdeaID, vk).Scan(&exists)
		if exists == 0 {
			voteID := uuid.New().String()
			if _, err := tx.Exec("INSERT INTO votes (id, idea_id, voter_key, created_at) VALUES (?, ?, ?, ?)", voteID, req.TargetIdeaID, vk, now); err == nil {
				newTransferredVotes++
			}
		}
	}

	// Remove votes from aliases so no duplicate vote records persist
	_, _ = tx.Exec(`
		DELETE FROM votes
		WHERE idea_id = ? OR idea_id IN (SELECT id FROM ideas WHERE merged_into_id = ?)
	`, req.SourceIdeaID, req.SourceIdeaID)

	// Consolidate subscriptions from source and all of its merged children
	sRows, err := tx.Query(`
		SELECT DISTINCT LOWER(user_email) FROM subscriptions
		WHERE idea_id = ? OR idea_id IN (SELECT id FROM ideas WHERE merged_into_id = ?)
	`, req.SourceIdeaID, req.SourceIdeaID)
	var sourceSubs []string
	if err == nil {
		for sRows.Next() {
			var se string
			if err := sRows.Scan(&se); err == nil && se != "" {
				sourceSubs = append(sourceSubs, strings.ToLower(strings.TrimSpace(se)))
			}
		}
		sRows.Close()
	}

	for _, se := range sourceSubs {
		var subExists int
		_ = tx.QueryRow("SELECT COUNT(*) FROM subscriptions WHERE idea_id = ? AND LOWER(user_email) = ?", req.TargetIdeaID, se).Scan(&subExists)
		if subExists == 0 {
			subID := uuid.New().String()
			if _, err := tx.Exec("INSERT INTO subscriptions (id, idea_id, user_email, created_at) VALUES (?, ?, ?, ?)", subID, req.TargetIdeaID, se, now); err != nil {
				return c.Status(500).JSON(fiber.Map{"error": "Failed to transfer subscription: " + err.Error()})
			}
		}
	}

	// Transactionally remove stale alias subscriptions across source and its merged children
	if _, err := tx.Exec(`
		DELETE FROM subscriptions
		WHERE idea_id = ? OR idea_id IN (SELECT id FROM ideas WHERE merged_into_id = ?)
	`, req.SourceIdeaID, req.SourceIdeaID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to clean alias subscriptions: " + err.Error()})
	}

	// Compute consolidated upvotes accurately
	additionalVotes := sourceUpvotes
	if len(sourceVoters) > 0 {
		untrackedVotes := sourceUpvotes - len(sourceVoters)
		if untrackedVotes < 0 {
			untrackedVotes = 0
		}
		additionalVotes = untrackedVotes + newTransferredVotes
	}

	if _, err := tx.Exec(`
		UPDATE ideas SET upvotes = upvotes + ?, updated_at = ?
		WHERE id = ?
	`, additionalVotes, now, req.TargetIdeaID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to update target idea: " + err.Error()})
	}

	// 3. Log audit status changes
	if _, err := tx.Exec(`
		INSERT INTO status_changes (id, idea_id, from_status, to_status, changed_by, public_note, created_at)
		VALUES (?, ?, ?, 'merged', 'Admin (Merge Engine)', ?, ?)
	`, uuid.New().String(), req.SourceIdeaID, sourceStatus, note, now); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to record audit status: " + err.Error()})
	}

	// 4. Insert merge notification for source author and source subscribers
	recipients := make(map[string]bool)
	if cleanAuthor := strings.ToLower(strings.TrimSpace(sourceAuthorEmail)); cleanAuthor != "" {
		recipients[cleanAuthor] = true
	}
	for _, se := range sourceSubs {
		if se != "" {
			recipients[se] = true
		}
	}

	mergeMsg := fmt.Sprintf("Your feedback \"%s\" was merged into \"%s\". All upvotes have been consolidated into the canonical idea.", sourceTitle, targetTitle)
	for rEmail := range recipients {
		notifID := uuid.New().String()
		if _, err := tx.Exec(`
			INSERT INTO notifications (id, idea_id, recipient_email, event_type, title, message, status, created_at)
			VALUES (?, ?, ?, 'merge', ?, ?, 'merged', ?)
		`, notifID, req.TargetIdeaID, rEmail, targetTitle, mergeMsg, now); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Failed to persist merge notification: " + err.Error()})
		}
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
	role := getAuthorizedRole(c)
	isTeam := role == "team" || role == "admin"

	type Request struct {
		Email  string `json:"email"`
		Action string `json:"action"` // "subscribe", "unsubscribe", "toggle"
	}
	var req Request
	if err := c.BodyParser(&req); err != nil || strings.TrimSpace(req.Email) == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Valid email is required"})
	}
	email := strings.TrimSpace(strings.ToLower(req.Email))

	callerVoterKey := strings.TrimSpace(strings.ToLower(c.Get("X-Voter-Key")))
	if !isTeam {
		// Protect notification preferences: callers can only manage their own subscription
		if callerVoterKey == "" || callerVoterKey != email {
			return c.Status(403).JSON(fiber.Map{"error": "Unauthorized to modify subscriptions for another email address"})
		}
	}

	var exists int
	_ = h.db.DB.QueryRow("SELECT COUNT(*) FROM ideas WHERE id = ?", id).Scan(&exists)
	if exists == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "Idea not found"})
	}

	// Resolve canonical idea ID and all related merge aliases
	canonicalID, familyIDs := h.getMergeFamilyIDs(id)

	var canonicalSubID string
	err := h.db.DB.QueryRow("SELECT id FROM subscriptions WHERE idea_id = ? AND LOWER(user_email) = ?", canonicalID, email).Scan(&canonicalSubID)
	subscribedToCanonical := (err == nil)

	anyFamilySubscribed := subscribedToCanonical
	if !anyFamilySubscribed {
		for _, fid := range familyIDs {
			var sid string
			if h.db.DB.QueryRow("SELECT id FROM subscriptions WHERE idea_id = ? AND LOWER(user_email) = ?", fid, email).Scan(&sid) == nil {
				anyFamilySubscribed = true
				break
			}
		}
	}

	action := strings.ToLower(strings.TrimSpace(req.Action))
	if action == "" {
		action = "toggle"
	}

	tx, err := h.db.DB.Begin()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to begin subscription transaction: " + err.Error()})
	}
	defer tx.Rollback()

	if action == "unsubscribe" || (action == "toggle" && anyFamilySubscribed) {
		for _, fid := range familyIDs {
			if _, err := tx.Exec("DELETE FROM subscriptions WHERE idea_id = ? AND LOWER(user_email) = ?", fid, email); err != nil {
				return c.Status(500).JSON(fiber.Map{"error": "Failed to unsubscribe: " + err.Error()})
			}
		}
		if err := tx.Commit(); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Failed to commit unsubscribe: " + err.Error()})
		}
		return c.JSON(fiber.Map{"subscribed": false, "message": "Unsubscribed successfully"})
	}

	if action == "subscribe" || (action == "toggle" && !anyFamilySubscribed) {
		// Clean up any stale alias subscriptions across the family
		for _, fid := range familyIDs {
			if fid != canonicalID {
				if _, err := tx.Exec("DELETE FROM subscriptions WHERE idea_id = ? AND LOWER(user_email) = ?", fid, email); err != nil {
					return c.Status(500).JSON(fiber.Map{"error": "Failed to clean alias subscriptions: " + err.Error()})
				}
			}
		}
		// Ensure canonical idea has the subscription
		if !subscribedToCanonical {
			subID := uuid.New().String()
			now := time.Now().UTC().Format(time.RFC3339)
			if _, err := tx.Exec("INSERT INTO subscriptions (id, idea_id, user_email, created_at) VALUES (?, ?, ?, ?)", subID, canonicalID, email, now); err != nil {
				return c.Status(500).JSON(fiber.Map{"error": "Failed to record subscription: " + err.Error()})
			}
		}
		if err := tx.Commit(); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Failed to commit subscription: " + err.Error()})
		}
		return c.JSON(fiber.Map{"subscribed": true, "message": "Subscribed successfully"})
	}

	return c.JSON(fiber.Map{"subscribed": subscribedToCanonical, "message": "Subscription state unchanged"})
}

// GET /api/notifications?email=user@example.com
func (h *Handler) GetNotifications(c *fiber.Ctx) error {
	role := getAuthorizedRole(c)
	isTeam := role == "team" || role == "admin"

	email := strings.TrimSpace(strings.ToLower(c.Query("email")))
	if email == "" {
		return c.JSON([]fiber.Map{})
	}

	callerVoterKey := strings.TrimSpace(strings.ToLower(c.Get("X-Voter-Key")))
	if !isTeam {
		// Prevent unauthorized access to another user's activity and notification history
		if callerVoterKey == "" || callerVoterKey != email {
			return c.Status(403).JSON(fiber.Map{"error": "Unauthorized to view notifications for this email address"})
		}
	}

	rows, err := h.db.DB.Query(`
		SELECT id, idea_id, event_type, title, message, status, created_at
		FROM notifications WHERE LOWER(recipient_email) = ?
		ORDER BY created_at DESC LIMIT 50
	`, email)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	type NotificationDTO struct {
		ID        string `json:"id"`
		IdeaID    string `json:"ideaId"`
		EventType string `json:"eventType"`
		Title     string `json:"title"`
		Message   string `json:"message"`
		Status    string `json:"status"`
		CreatedAt string `json:"createdAt"`
	}

	var results []NotificationDTO
	for rows.Next() {
		var n NotificationDTO
		if err := rows.Scan(&n.ID, &n.IdeaID, &n.EventType, &n.Title, &n.Message, &n.Status, &n.CreatedAt); err == nil {
			results = append(results, n)
		}
	}
	if results == nil {
		results = []NotificationDTO{}
	}

	return c.JSON(results)
}
