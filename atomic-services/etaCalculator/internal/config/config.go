//get env files

package config

import (
	"os"

	"github.com/joho/godotenv"
)

//grouped into a struct so they can be used together

type Config struct {
	Port          string
	GoogleAPIKey  string
	GoogleBaseURL string
}

func Load() *Config {
	_ = godotenv.Load("../../.env") //loading directly from .env file
	return &Config{
		Port:          getEnv("PORT", "8084"),
		GoogleAPIKey:  os.Getenv("GOOGLE_ROUTES_API_KEY"),
		GoogleBaseURL: getEnv("GOOGLE_ROUTES_BASE_URL", "https://routes.googleapis.com"),
	}
}

// return default variables if is null in env
func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
