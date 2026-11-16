package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"idea-hub-api/internal/database"
	"idea-hub-api/internal/handlers"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

func setupTestApp(t *testing.T) (*fiber.App, *database.Service) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test.db")
	t.Setenv("DB_PATH", dbPath)
	t.Setenv("ADMIN_API_KEY", "test-admin-secret-key")

	db, err := database.New()
	if err != nil {
		t.Fatalf("Failed to initialize test DB: %v", err)
	}

	app := fiber.New()
	h := handlers.New(db)
	api := app.Group("/api")

	api.Get("/ideas", h.GetIdeas)
	api.Get("/ideas/:id", h.GetIdeaByID)
	api.Post("/ideas", h.CreateIdea)
	api.Post("/ideas/:id/subscribe", h.ToggleSubscription)
	api.Post("/ideas/:id/status", h.UpdateStatus)
	api.Post("/ideas/:id/comments", h.CreateComment)
	api.Post("/ideas/merge", h.MergeIdeas)
	api.Get("/notifications", h.GetNotifications)

	return app, db
}

func createTestIdea(t *testing.T, db *database.Service, id, title, desc, email string) {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := db.DB.Exec(`
		INSERT INTO ideas (id, title, description, category, status, author_name, author_email, upvotes, created_at, updated_at)
		VALUES (?, ?, ?, 'Core Feature', 'under-review', 'Author', ?, 1, ?, ?)
	`, id, title, desc, email, now, now)
	if err != nil {
		t.Fatalf("Failed to insert test idea %s: %v", id, err)
	}
}

func TestMergeNotification_PersistedOnSuccess(t *testing.T) {
	app, db := setupTestApp(t)
	defer db.DB.Close()

	idA := uuid.New().String()
	idB := uuid.New().String()
	authorA := "alice@example.com"
	authorB := "bob@example.com"

	createTestIdea(t, db, idA, "Dark Mode for Mobile", "Please add dark mode on iOS", authorA)
	createTestIdea(t, db, idB, "Add Dark Theme", "Night mode support", authorB)

	// Merge A into B as Admin
	mergePayload, _ := json.Marshal(map[string]string{
		"sourceIdeaId": idA,
		"targetIdeaId": idB,
		"note":         "Duplicate of Add Dark Theme",
	})

	req := httptest.NewRequest("POST", "/api/ideas/merge", bytes.NewReader(mergePayload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Admin-Key", "test-admin-secret-key")
	req.Header.Set("X-User-Role", "admin")

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("Merge request failed: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("Expected status 200 on merge, got %d", resp.StatusCode)
	}

	// Verify notification persisted for authorA
	var notifCount int
	var notifIdeaID, notifMsg string
	err = db.DB.QueryRow(`
		SELECT COUNT(*), idea_id, message FROM notifications
		WHERE LOWER(recipient_email) = LOWER(?)
	`, authorA).Scan(&notifCount, &notifIdeaID, &notifMsg)
	if err != nil {
		t.Fatalf("Failed to query notifications: %v", err)
	}

	if notifCount != 1 {
		t.Fatalf("Expected exactly 1 notification for source author, got %d", notifCount)
	}
	if notifIdeaID != idB {
		t.Fatalf("Expected notification idea_id to be target idea %s, got %s", idB, notifIdeaID)
	}
	if notifMsg == "" {
		t.Fatal("Expected non-empty merge notification message")
	}

	// Verify GET /api/notifications returns the merge event
	getNotifReq := httptest.NewRequest("GET", "/api/notifications?email="+authorA, nil)
	getNotifReq.Header.Set("X-Voter-Key", authorA)
	notifResp, err := app.Test(getNotifReq)
	if err != nil || notifResp.StatusCode != 200 {
		t.Fatalf("Expected 200 from GET notifications, got status %d, err: %v", notifResp.StatusCode, err)
	}

	var notifs []map[string]interface{}
	_ = json.NewDecoder(notifResp.Body).Decode(&notifs)
	if len(notifs) != 1 {
		t.Fatalf("Expected 1 notification in API response, got %d", len(notifs))
	}
	if notifs[0]["status"] != "merged" {
		t.Fatalf("Expected notification status 'merged', got %v", notifs[0]["status"])
	}
}

func TestMergeNotification_NotPersistedOnRollback(t *testing.T) {
	app, db := setupTestApp(t)
	defer db.DB.Close()

	idA := uuid.New().String()
	idB := uuid.New().String()
	authorA := "alice@example.com"

	createTestIdea(t, db, idA, "Idea A", "Desc A", authorA)
	// Notice: idB does not exist in DB! Merge should fail and rollback

	mergePayload, _ := json.Marshal(map[string]string{
		"sourceIdeaId": idA,
		"targetIdeaId": idB,
	})

	req := httptest.NewRequest("POST", "/api/ideas/merge", bytes.NewReader(mergePayload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Admin-Key", "test-admin-secret-key")
	req.Header.Set("X-User-Role", "admin")

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("Merge request failed: %v", err)
	}
	if resp.StatusCode != 404 {
		t.Fatalf("Expected 404 on invalid target, got %d", resp.StatusCode)
	}

	// Ensure NO notifications were inserted
	var count int
	_ = db.DB.QueryRow("SELECT COUNT(*) FROM notifications").Scan(&count)
	if count != 0 {
		t.Fatalf("Expected 0 notifications after rollback, got %d", count)
	}
}

func TestChainedMerge_Resubscription(t *testing.T) {
	app, db := setupTestApp(t)
	defer db.DB.Close()

	idA := uuid.New().String()
	idB := uuid.New().String()
	idC := uuid.New().String()
	subscriber := "reader@example.com"

	createTestIdea(t, db, idA, "Idea A", "Desc A", "authorA@example.com")
	createTestIdea(t, db, idB, "Idea B", "Desc B", "authorB@example.com")
	createTestIdea(t, db, idC, "Idea C", "Desc C", "authorC@example.com")

	// 1. Reader subscribes to Idea A
	subPayload, _ := json.Marshal(map[string]string{
		"email":  subscriber,
		"action": "subscribe",
	})
	subReq := httptest.NewRequest("POST", "/api/ideas/"+idA+"/subscribe", bytes.NewReader(subPayload))
	subReq.Header.Set("Content-Type", "application/json")
	subReq.Header.Set("X-Voter-Key", subscriber)
	resp, _ := app.Test(subReq)
	if resp.StatusCode != 200 {
		t.Fatalf("Failed to subscribe to A: %d", resp.StatusCode)
	}

	// 2. Chained merge: A -> B, then B -> C
	mergeAB, _ := json.Marshal(map[string]string{"sourceIdeaId": idA, "targetIdeaId": idB})
	reqAB := httptest.NewRequest("POST", "/api/ideas/merge", bytes.NewReader(mergeAB))
	reqAB.Header.Set("Content-Type", "application/json")
	reqAB.Header.Set("X-Admin-Key", "test-admin-secret-key")
	reqAB.Header.Set("X-User-Role", "admin")
	respAB, _ := app.Test(reqAB)
	if respAB.StatusCode != 200 {
		t.Fatalf("Failed merge A->B: %d", respAB.StatusCode)
	}

	mergeBC, _ := json.Marshal(map[string]string{"sourceIdeaId": idB, "targetIdeaId": idC})
	reqBC := httptest.NewRequest("POST", "/api/ideas/merge", bytes.NewReader(mergeBC))
	reqBC.Header.Set("Content-Type", "application/json")
	reqBC.Header.Set("X-Admin-Key", "test-admin-secret-key")
	reqBC.Header.Set("X-User-Role", "admin")
	respBC, _ := app.Test(reqBC)
	if respBC.StatusCode != 200 {
		t.Fatalf("Failed merge B->C: %d", respBC.StatusCode)
	}

	// Subscriptions should now be canonicalized to C; aliases A and B should have 0 subscriptions
	var countA, countB, countC int
	_ = db.DB.QueryRow("SELECT COUNT(*) FROM subscriptions WHERE idea_id = ? AND LOWER(user_email) = ?", idA, subscriber).Scan(&countA)
	_ = db.DB.QueryRow("SELECT COUNT(*) FROM subscriptions WHERE idea_id = ? AND LOWER(user_email) = ?", idB, subscriber).Scan(&countB)
	_ = db.DB.QueryRow("SELECT COUNT(*) FROM subscriptions WHERE idea_id = ? AND LOWER(user_email) = ?", idC, subscriber).Scan(&countC)

	if countA != 0 || countB != 0 {
		t.Fatalf("Expected 0 subscriptions on aliases A and B after merge, got A=%d, B=%d", countA, countB)
	}
	if countC != 1 {
		t.Fatalf("Expected 1 subscription on canonical C after merge, got %d", countC)
	}

	// 3. Unsubscribe through alias A
	unsubPayload, _ := json.Marshal(map[string]string{
		"email":  subscriber,
		"action": "unsubscribe",
	})
	unsubReq := httptest.NewRequest("POST", "/api/ideas/"+idA+"/subscribe", bytes.NewReader(unsubPayload))
	unsubReq.Header.Set("Content-Type", "application/json")
	unsubReq.Header.Set("X-Voter-Key", subscriber)
	unsubResp, _ := app.Test(unsubReq)
	if unsubResp.StatusCode != 200 {
		t.Fatalf("Failed to unsubscribe through alias A: %d", unsubResp.StatusCode)
	}

	// Verify completely unsubscribed across the whole merge family
	var countTotal int
	_ = db.DB.QueryRow("SELECT COUNT(*) FROM subscriptions WHERE LOWER(user_email) = ?", subscriber).Scan(&countTotal)
	if countTotal != 0 {
		t.Fatalf("Expected 0 subscriptions after unsubscribe through alias A, got %d", countTotal)
	}

	// 4. Resubscribe through alias B
	resubPayload, _ := json.Marshal(map[string]string{
		"email":  subscriber,
		"action": "subscribe",
	})
	resubReq := httptest.NewRequest("POST", "/api/ideas/"+idB+"/subscribe", bytes.NewReader(resubPayload))
	resubReq.Header.Set("Content-Type", "application/json")
	resubReq.Header.Set("X-Voter-Key", subscriber)
	resubResp, _ := app.Test(resubReq)
	if resubResp.StatusCode != 200 {
		t.Fatalf("Failed to resubscribe through alias B: %d", resubResp.StatusCode)
	}

	var resubBody map[string]interface{}
	_ = json.NewDecoder(resubResp.Body).Decode(&resubBody)
	if resubBody["subscribed"] != true {
		t.Fatalf("Expected subscribed: true, got %v", resubBody["subscribed"])
	}

	// Verify canonical idea C now holds the subscription!
	var finalCountC int
	_ = db.DB.QueryRow("SELECT COUNT(*) FROM subscriptions WHERE idea_id = ? AND LOWER(user_email) = ?", idC, subscriber).Scan(&finalCountC)
	if finalCountC != 1 {
		t.Fatalf("Expected canonical idea C to hold subscription after resubscribe through alias B, got %d", finalCountC)
	}

	// Verify GetIdeaByID on canonical C returns the subscriber
	getDetailReq := httptest.NewRequest("GET", "/api/ideas/"+idC, nil)
	getDetailReq.Header.Set("X-Voter-Key", subscriber)
	detailResp, _ := app.Test(getDetailReq)
	if detailResp.StatusCode != 200 {
		t.Fatalf("Failed to get detail for C: %d", detailResp.StatusCode)
	}

	var detailBody map[string]interface{}
	_ = json.NewDecoder(detailResp.Body).Decode(&detailBody)
	subs, ok := detailBody["subscribers"].([]interface{})
	if !ok || len(subs) != 1 {
		t.Fatalf("Expected 1 subscriber in detail for C, got %v", detailBody["subscribers"])
	}
}

func init() {
	_ = os.Setenv("PORT", "0")
}
