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
	authorB := "bob@example.com"

	createTestIdea(t, db, idA, "Idea A", "Desc A", authorA)
	createTestIdea(t, db, idB, "Idea B", "Desc B", authorB)

	// Install a trigger that aborts notification insertion, forcing a transactional rollback after writes
	_, err := db.DB.Exec("CREATE TRIGGER fail_notif BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT, 'forced notification failure'); END;")
	if err != nil {
		t.Fatalf("Failed to create test trigger: %v", err)
	}
	defer func() {
		_, _ = db.DB.Exec("DROP TRIGGER IF EXISTS fail_notif")
	}()

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
	if resp.StatusCode != 500 {
		t.Fatalf("Expected 500 on transaction failure, got %d", resp.StatusCode)
	}

	// Verify database rollback: Idea A must still be 'under-review' with NULL merged_into_id
	var statusA string
	var mergedIntoA *string
	err = db.DB.QueryRow("SELECT status, merged_into_id FROM ideas WHERE id = ?", idA).Scan(&statusA, &mergedIntoA)
	if err != nil {
		t.Fatalf("Failed to query idea A: %v", err)
	}
	if statusA != "under-review" {
		t.Fatalf("Expected idea A status 'under-review' after rollback, got %s", statusA)
	}
	if mergedIntoA != nil {
		t.Fatalf("Expected idea A merged_into_id to be NULL after rollback, got %v", *mergedIntoA)
	}

	// Verify database rollback: Idea B upvotes must not have incremented
	var upvotesB int
	_ = db.DB.QueryRow("SELECT upvotes FROM ideas WHERE id = ?", idB).Scan(&upvotesB)
	if upvotesB != 1 {
		t.Fatalf("Expected idea B upvotes to remain 1 after rollback, got %d", upvotesB)
	}

	// Ensure NO notifications were inserted
	var count int
	_ = db.DB.QueryRow("SELECT COUNT(*) FROM notifications").Scan(&count)
	if count != 0 {
		t.Fatalf("Expected 0 notifications after rollback, got %d", count)
	}

	// Ensure NO status_changes were recorded
	var changeCount int
	_ = db.DB.QueryRow("SELECT COUNT(*) FROM status_changes WHERE idea_id = ? AND to_status = 'merged'", idA).Scan(&changeCount)
	if changeCount != 0 {
		t.Fatalf("Expected 0 status changes for idea A after rollback, got %d", changeCount)
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

func TestMergedDiscussion_ReplyNotificationDelivery(t *testing.T) {
	app, db := setupTestApp(t)
	defer db.DB.Close()

	idA := uuid.New().String()
	idB := uuid.New().String()
	authorA := "alice@example.com"
	authorB := "bob@example.com"
	reader := "reader@example.com"

	createTestIdea(t, db, idA, "Idea A", "Desc A", authorA)
	createTestIdea(t, db, idB, "Idea B", "Desc B", authorB)

	// 1. Reader subscribes to Idea A
	subPayload, _ := json.Marshal(map[string]string{
		"email":  reader,
		"action": "subscribe",
	})
	subReq := httptest.NewRequest("POST", "/api/ideas/"+idA+"/subscribe", bytes.NewReader(subPayload))
	subReq.Header.Set("Content-Type", "application/json")
	subReq.Header.Set("X-Voter-Key", reader)
	subResp, _ := app.Test(subReq)
	if subResp.StatusCode != 200 {
		t.Fatalf("Failed to subscribe reader: %d", subResp.StatusCode)
	}

	// 2. Merge Idea A into Idea B
	mergePayload, _ := json.Marshal(map[string]string{
		"sourceIdeaId": idA,
		"targetIdeaId": idB,
	})
	mergeReq := httptest.NewRequest("POST", "/api/ideas/merge", bytes.NewReader(mergePayload))
	mergeReq.Header.Set("Content-Type", "application/json")
	mergeReq.Header.Set("X-Admin-Key", "test-admin-secret-key")
	mergeReq.Header.Set("X-User-Role", "admin")
	mergeResp, _ := app.Test(mergeReq)
	if mergeResp.StatusCode != 200 {
		t.Fatalf("Failed to merge A into B: %d", mergeResp.StatusCode)
	}

	// 3. Product team posts a public comment on merged Idea A
	commentPayload, _ := json.Marshal(map[string]interface{}{
		"authorName": "Product Team",
		"content":    "We have addressed this in the latest update!",
		"isInternal": false,
	})
	commentReq := httptest.NewRequest("POST", "/api/ideas/"+idA+"/comments", bytes.NewReader(commentPayload))
	commentReq.Header.Set("Content-Type", "application/json")
	commentReq.Header.Set("X-Admin-Key", "test-admin-secret-key")
	commentReq.Header.Set("X-User-Role", "team")
	commentResp, _ := app.Test(commentReq)
	if commentResp.StatusCode != 201 {
		t.Fatalf("Failed to post team comment on merged idea: %d", commentResp.StatusCode)
	}

	// 4. Verify reader receives a reply notification linking to Idea A
	notifReq := httptest.NewRequest("GET", "/api/notifications?email="+reader, nil)
	notifReq.Header.Set("X-Voter-Key", reader)
	notifResp, err := app.Test(notifReq)
	if err != nil || notifResp.StatusCode != 200 {
		t.Fatalf("Failed to get notifications for reader: %v", err)
	}

	var readerNotifs []map[string]interface{}
	_ = json.NewDecoder(notifResp.Body).Decode(&readerNotifs)
	var readerTeamReply map[string]interface{}
	for _, n := range readerNotifs {
		if n["eventType"] == "team_reply" {
			readerTeamReply = n
			break
		}
	}
	if readerTeamReply == nil {
		t.Fatalf("Expected reader to receive team_reply notification, got %v", readerNotifs)
	}
	if readerTeamReply["ideaId"] != idA {
		t.Fatalf("Expected notification ideaId to link to discussion idea %s, got %v", idA, readerTeamReply["ideaId"])
	}

	// 5. Verify author Alice also receives the reply notification
	aliceReq := httptest.NewRequest("GET", "/api/notifications?email="+authorA, nil)
	aliceReq.Header.Set("X-Voter-Key", authorA)
	aliceResp, err := app.Test(aliceReq)
	if err != nil || aliceResp.StatusCode != 200 {
		t.Fatalf("Failed to get notifications for author: %v", err)
	}
	var aliceNotifs []map[string]interface{}
	_ = json.NewDecoder(aliceResp.Body).Decode(&aliceNotifs)
	foundAliceReply := false
	for _, n := range aliceNotifs {
		if n["eventType"] == "team_reply" && n["ideaId"] == idA {
			foundAliceReply = true
			break
		}
	}
	if !foundAliceReply {
		t.Fatalf("Expected author Alice to receive team_reply notification for idea %s", idA)
	}
}

func TestMerge_StatusTransitionRejected(t *testing.T) {
	app, db := setupTestApp(t)
	defer db.DB.Close()

	idA := uuid.New().String()
	idB := uuid.New().String()
	authorA := "alice@example.com"
	authorB := "bob@example.com"

	createTestIdea(t, db, idA, "Idea A", "Desc A", authorA)
	createTestIdea(t, db, idB, "Idea B", "Desc B", authorB)

	// Record initial author vote rows in votes table
	now := time.Now().UTC().Format(time.RFC3339)
	_, _ = db.DB.Exec("INSERT INTO votes (id, idea_id, voter_key, created_at) VALUES (?, ?, ?, ?)", uuid.New().String(), idA, authorA, now)
	_, _ = db.DB.Exec("INSERT INTO votes (id, idea_id, voter_key, created_at) VALUES (?, ?, ?, ?)", uuid.New().String(), idB, authorB, now)

	// 1. Merge A into B
	mergePayload, _ := json.Marshal(map[string]string{
		"sourceIdeaId": idA,
		"targetIdeaId": idB,
	})
	req1 := httptest.NewRequest("POST", "/api/ideas/merge", bytes.NewReader(mergePayload))
	req1.Header.Set("Content-Type", "application/json")
	req1.Header.Set("X-Admin-Key", "test-admin-secret-key")
	req1.Header.Set("X-User-Role", "admin")
	resp1, _ := app.Test(req1)
	if resp1.StatusCode != 200 {
		t.Fatalf("Failed merge: %d", resp1.StatusCode)
	}

	var upvotesB1 int
	_ = db.DB.QueryRow("SELECT upvotes FROM ideas WHERE id = ?", idB).Scan(&upvotesB1)
	if upvotesB1 != 2 {
		t.Fatalf("Expected idea B upvotes to be 2 after merge, got %d", upvotesB1)
	}

	// 2. Attempt to reopen Idea A out of 'merged' status via UpdateStatus
	statusPayload, _ := json.Marshal(map[string]string{
		"status": "under-review",
		"note":   "Attempting to reopen feedback item",
	})
	statusReq := httptest.NewRequest("POST", "/api/ideas/"+idA+"/status", bytes.NewReader(statusPayload))
	statusReq.Header.Set("Content-Type", "application/json")
	statusReq.Header.Set("X-Admin-Key", "test-admin-secret-key")
	statusReq.Header.Set("X-User-Role", "admin")
	statusResp, _ := app.Test(statusReq)
	if statusResp.StatusCode != 400 {
		t.Fatalf("Expected 400 Bad Request when attempting to reopen merged idea, got %d", statusResp.StatusCode)
	}

	// Verify Target B upvotes remains 2 (not erased or corrupted)
	var upvotesB2 int
	_ = db.DB.QueryRow("SELECT upvotes FROM ideas WHERE id = ?", idB).Scan(&upvotesB2)
	if upvotesB2 != 2 {
		t.Fatalf("Expected idea B upvotes to remain 2, got %d", upvotesB2)
	}

	// Verify Idea A remains 'merged' and linked to B
	var statusA string
	var mergedIntoA *string
	_ = db.DB.QueryRow("SELECT status, merged_into_id FROM ideas WHERE id = ?", idA).Scan(&statusA, &mergedIntoA)
	if statusA != "merged" {
		t.Fatalf("Expected idea A status to remain 'merged', got %s", statusA)
	}
	if mergedIntoA == nil || *mergedIntoA != idB {
		t.Fatalf("Expected idea A to remain merged into %s, got %v", idB, mergedIntoA)
	}
}

func TestMerge_ZeroVoteIdea_DoesNotInventVote(t *testing.T) {
	app, db := setupTestApp(t)
	defer db.DB.Close()

	idA := uuid.New().String()
	idB := uuid.New().String()
	authorA := "alice@example.com"
	authorB := "bob@example.com"

	createTestIdea(t, db, idA, "Idea A", "Desc A", authorA)
	createTestIdea(t, db, idB, "Idea B", "Desc B", authorB)

	now := time.Now().UTC().Format(time.RFC3339)
	_, _ = db.DB.Exec("INSERT INTO votes (id, idea_id, voter_key, created_at) VALUES (?, ?, ?, ?)", uuid.New().String(), idA, authorA, now)
	_, _ = db.DB.Exec("INSERT INTO votes (id, idea_id, voter_key, created_at) VALUES (?, ?, ?, ?)", uuid.New().String(), idB, authorB, now)

	// Alice removes her initial upvote on Idea A
	_, err := db.DB.Exec("DELETE FROM votes WHERE idea_id = ? AND voter_key = ?", idA, authorA)
	if err != nil {
		t.Fatalf("Failed to remove vote: %v", err)
	}
	_, err = db.DB.Exec("UPDATE ideas SET upvotes = 0 WHERE id = ?", idA)
	if err != nil {
		t.Fatalf("Failed to set upvotes 0: %v", err)
	}

	// Merge Idea A (0 votes) into Idea B (1 vote)
	mergePayload, _ := json.Marshal(map[string]string{
		"sourceIdeaId": idA,
		"targetIdeaId": idB,
	})
	req := httptest.NewRequest("POST", "/api/ideas/merge", bytes.NewReader(mergePayload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Admin-Key", "test-admin-secret-key")
	req.Header.Set("X-User-Role", "admin")
	resp, _ := app.Test(req)
	if resp.StatusCode != 200 {
		t.Fatalf("Failed to merge zero-vote idea: %d", resp.StatusCode)
	}

	// Verify Target B upvotes remains 1 (no invented votes)
	var upvotesB int
	_ = db.DB.QueryRow("SELECT upvotes FROM ideas WHERE id = ?", idB).Scan(&upvotesB)
	if upvotesB != 1 {
		t.Fatalf("Expected target idea B upvotes to remain 1, got %d", upvotesB)
	}

	// Verify Target B has no vote row from authorA
	var authorAVotes int
	_ = db.DB.QueryRow("SELECT COUNT(*) FROM votes WHERE idea_id = ? AND voter_key = ?", idB, authorA).Scan(&authorAVotes)
	if authorAVotes != 0 {
		t.Fatalf("Expected 0 votes from authorA on target B, got %d", authorAVotes)
	}
}

func init() {
	_ = os.Setenv("PORT", "0")
}
