#!/bin/bash

# TradeNote Complete Startup Script
# Startet alle Services und initialisiert die Datenbank

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "🚀 TradeNote Startup..."
echo "========================"

# 1. Docker Services starten
echo ""
echo "📦 Starting Docker services..."
docker compose up -d

# 2. Warten bis PostgreSQL bereit ist
echo ""
echo "⏳ Waiting for PostgreSQL to be ready..."
until docker exec tradinghub_postgres pg_isready -U tradenote -d setup_archive > /dev/null 2>&1; do
  echo "   PostgreSQL is starting..."
  sleep 2
done
echo "✅ PostgreSQL is ready!"

# 3. Warten bis MongoDB bereit ist
echo ""
echo "⏳ Waiting for MongoDB to be ready..."
until docker exec tradinghub_mongo mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; do
  echo "   MongoDB is starting..."
  sleep 2
done
echo "✅ MongoDB is ready!"

# 4. Warten bis Redis bereit ist
echo ""
echo "⏳ Waiting for Redis to be ready..."
until docker exec tradinghub_redis redis-cli ping > /dev/null 2>&1; do
  echo "   Redis is starting..."
  sleep 2
done
echo "✅ Redis is ready!"

# 5. Datenbank Schema pushen
echo ""
echo "🗄️  Pushing database schema..."
npm run db:push

echo ""
echo "========================"
echo "✅ All services are running!"
echo ""
echo "📊 Services:"
echo "   - App:        http://localhost:3000"
echo "   - Backend:    http://localhost:28080"
echo "   - PostgreSQL: localhost:5433"
echo "   - MongoDB:    localhost:27017"
echo "   - Redis:      localhost:6379"
echo ""
echo "📝 Database Commands:"
echo "   - npm run db:studio   # Open Drizzle Studio"
echo "   - npm run db:push     # Push schema changes"
echo ""
echo "🛑 To stop: npm run down"
