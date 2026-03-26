FROM golang:1.25-alpine AS builder
LABEL authors="Javen"
WORKDIR /app
COPY go.mod go.sum ./
# Ensure git and certificates are available for fetching modules
RUN apk add --no-cache git ca-certificates && go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /service ./cmd/

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
COPY --from=builder /service .
EXPOSE 8088
CMD ["./service"]
