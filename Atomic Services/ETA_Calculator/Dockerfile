FROM golang:1.22-alpine AS builder
LABEL authors="Javen"
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /service ./cmd/

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
COPY --from=builder /service .
EXPOSE 8084
CMD ["./service"]
