//get env files

package config

import (
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

//grouped into a struct so they can be used together

type Config struct {
	Port               string
	RedisAddr          string
	RedisPassword      string
	GoogleAPIKey       string
	GoogleBaseURL      string
	ETACacheTTLSeconds int
}

func Load() *Config {
	_ = godotenv.Load("../../.env")                               //loading directly from .env file
	ttl, _ := strconv.Atoi(getEnv("ETA_CACHE_TTL_SECONDS", "30")) //sets the redis cache time to 3 by default
	return &Config{
		Port:               getEnv("PORT", "8084"),
		RedisAddr:          getEnv("REDIS_ADDR", "localhost:6379"),
		RedisPassword:      getEnv("REDIS_PASSWORD", ""),
		GoogleAPIKey:       os.Getenv("GOOGLE_ROUTES_API_KEY"),
		GoogleBaseURL:      getEnv("GOOGLE_ROUTES_BASE_URL", "https://routes.googleapis.com"),
		ETACacheTTLSeconds: ttl,
	}
}

// return default variables if is null in env
func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
