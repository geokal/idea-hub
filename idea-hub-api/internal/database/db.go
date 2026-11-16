package database

import (
	"database/sql"
	"log"
	"os"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type Service struct {
	DB *sql.DB
}

func New() *Service {
	dbPath := "feedback.db"
	if envPath := os.Getenv("DB_PATH"); envPath != "" {
		dbPath = envPath
	}

	db, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		log.Fatalf("Fatal: failed to open SQLite database: %v", err)
	}

	db.SetMaxOpenConns(1) // SQLite works best with 1 writer

	s := &Service{DB: db}
	s.initSchema()
	s.seedDataIfEmpty()
	return s
}

func (s *Service) initSchema() {
	schema := `
	CREATE TABLE IF NOT EXISTS ideas (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		description TEXT NOT NULL,
		category TEXT NOT NULL,
		status TEXT NOT NULL,
		author_name TEXT NOT NULL,
		author_email TEXT NOT NULL,
		upvotes INTEGER NOT NULL DEFAULT 1,
		merged_into_id TEXT,
		merged_into_title TEXT,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);

	CREATE TABLE IF NOT EXISTS comments (
		id TEXT PRIMARY KEY,
		idea_id TEXT NOT NULL,
		author_name TEXT NOT NULL,
		author_email TEXT NOT NULL,
		is_team_member INTEGER NOT NULL DEFAULT 0,
		is_internal INTEGER NOT NULL DEFAULT 0,
		body TEXT NOT NULL,
		created_at TEXT NOT NULL,
		FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS status_changes (
		id TEXT PRIMARY KEY,
		idea_id TEXT NOT NULL,
		from_status TEXT NOT NULL,
		to_status TEXT NOT NULL,
		changed_by TEXT NOT NULL,
		public_note TEXT,
		created_at TEXT NOT NULL,
		FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE
	);
	`
	if _, err := s.DB.Exec(schema); err != nil {
		log.Fatalf("Fatal: failed to initialize schema: %v", err)
	}
}

func (s *Service) seedDataIfEmpty() {
	var count int
	_ = s.DB.QueryRow("SELECT COUNT(*) FROM ideas").Scan(&count)
	if count > 0 {
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)

	// Seed items matching Sarah's Dashboard Sketch directly
	items := []struct {
		ID          string
		Title       string
		Desc        string
		Cat         string
		Status      string
		Name        string
		Email       string
		Upvotes     int
		MergedID    sql.NullString
		MergedTitle sql.NullString
	}{
		{
			ID:      "sketch-1",
			Title:   "New Feature Request",
			Desc:    "Request to add a new feature.",
			Cat:     "Core Feature",
			Status:  "under-review",
			Name:    "Sarah Customer",
			Email:   "sarah.c@external.com",
			Upvotes: 35,
		},
		{
			ID:      "sketch-2",
			Title:   "Improve Search Function",
			Desc:    "Enhance the search options.",
			Cat:     "Performance",
			Status:  "planned",
			Name:    "Alex Customer",
			Email:   "alex@company.com",
			Upvotes: 20,
		},
		{
			ID:      "sketch-3",
			Title:   "Bug in Checkout Process",
			Desc:    "Issue with payment steps.",
			Cat:     "Core Feature",
			Status:  "in-progress",
			Name:    "E-commerce User",
			Email:   "buyer@shop.io",
			Upvotes: 15,
		},
		{
			ID:      "sketch-4",
			Title:   "Add Dark Mode",
			Desc:    "Option for dark theme.",
			Cat:     "UI / UX",
			Status:  "completed",
			Name:    "Community Dev",
			Email:   "nightowl@coder.com",
			Upvotes: 42,
		},
	}

	for _, item := range items {
		_, err := s.DB.Exec(`
			INSERT INTO ideas (id, title, description, category, status, author_name, author_email, upvotes, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, item.ID, item.Title, item.Desc, item.Cat, item.Status, item.Name, item.Email, item.Upvotes, now, now)
		if err != nil {
			log.Printf("Warning: failed to seed idea %s: %v", item.ID, err)
		}
	}
}
