package main

import (
	"log"
	"os"
	"time"

	"idea-hub-api/internal/database"
	"idea-hub-api/internal/handlers"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
)

func main() {
	// Initialize SQLite Database with WAL mode & Seed data
	db, err := database.New()
	if err != nil {
		log.Fatalf("Fatal: failed to initialize database: %v", err)
	}
	defer db.DB.Close()

	// Initialize Fiber App
	app := fiber.New(fiber.Config{
		AppName: "IdeaHub Feedback API (Go + Fiber + SQLite)",
	})

	// Middleware
	app.Use(logger.New())
	app.Use(recover.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: "http://localhost:4300, http://localhost:4200, http://127.0.0.1:4300",
		AllowHeaders: "Origin, Content-Type, Accept, X-User-Role, Authorization, X-Admin-Key, X-Voter-Key",
		AllowMethods: "GET, POST, PUT, DELETE, OPTIONS",
	}))

	// Global rate limiter for API endpoints (anti-abuse & submission spam protection)
	app.Use("/api", limiter.New(limiter.Config{
		Max:        120,
		Expiration: 1 * time.Minute,
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"error": "Rate limit exceeded. Please wait a moment before trying again.",
			})
		},
	}))

	// Health Check
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status":   "healthy",
			"database": "sqlite",
			"engine":   "fiber/v2",
		})
	})

	// Register Routes
	h := handlers.New(db)
	api := app.Group("/api")

	api.Get("/ideas", h.GetIdeas)
	api.Get("/ideas/:id", h.GetIdeaByID)
	api.Post("/ideas", h.CreateIdea)
	api.Post("/ideas/:id/upvote", h.UpvoteIdea)
	api.Post("/ideas/:id/vote", h.VoteIdea)
	api.Post("/ideas/:id/subscribe", h.ToggleSubscription)
	api.Post("/ideas/:id/status", h.UpdateStatus)
	api.Post("/ideas/:id/comments", h.CreateComment)
	api.Post("/ideas/merge", h.MergeIdeas)
	api.Delete("/ideas/:id", h.DeleteIdea)
	api.Get("/export/csv", h.ExportCSV)
	api.Get("/notifications", h.GetNotifications)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("🚀 IdeaHub Go Fiber API running on http://localhost:%s\n", port)
	if err := app.Listen(":" + port); err != nil {
		log.Fatalf("Fatal: server terminated: %v", err)
	}
}
