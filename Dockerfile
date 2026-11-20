FROM node:22.23.5-alpine3.23 AS frontend

WORKDIR /build/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM golang:1.27.4-alpine3.23 AS builder

WORKDIR /build/backend

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/cmd/ ./cmd/
COPY backend/internal/ ./internal/
COPY backend/pkg/ ./pkg/
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

FROM scratch

WORKDIR /app

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=builder /out/server ./server
COPY --from=frontend /build/frontend/dist/ ./public/

USER 10001:10001
EXPOSE 8080

ENTRYPOINT ["/app/server"]
