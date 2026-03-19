// cmd/main.go
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"

	"cloudKitchen/ETACalculator/internal/config"
	"cloudKitchen/ETACalculator/internal/handler"
	"cloudKitchen/ETACalculator/internal/routes"
)

func main() {
	cfg := config.Load()

	googleClient := routes.NewClient(cfg.GoogleAPIKey, cfg.GoogleBaseURL)

	h := handler.New(googleClient)

	r := chi.NewRouter()
	r.Get("/api/v1/eta/calculate", h.CalculateETA)
	r.Get("/health", h.Health)

	server := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.Port),
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Printf("ETA Calculation listening on :%s", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("Shutting down...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	server.Shutdown(shutdownCtx)
	log.Println("ETA Calculation stopped")
}
