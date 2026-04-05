#!/bin/bash
# MCP Federation Quick Setup Script
# Sets up the complete federation environment

set -e

echo "🚀 MCP Federation Quick Setup"
echo "=============================="

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    echo "❌ Docker is required. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is required. Please install Docker Compose first."
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required. Please install Python 3.9+ first."
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required. Please install Node.js 18+ first."
    exit 1
fi

echo "✅ Prerequisites check passed"

# Run Python setup script
echo "⚙️  Running federation setup..."
python3 scripts/setup_federation.py

# Build and start services
echo "🏗️  Building and starting federation services..."
docker-compose build

echo "🚀 Starting federation..."
docker-compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
sleep 10

# Test federation health
echo "🩺 Testing federation health..."
if curl -f http://localhost:10857/health &>/dev/null; then
    echo "✅ Federation Bridge is healthy"
else
    echo "⚠️  Federation Bridge not ready yet (this is normal)"
fi

if curl -f http://localhost:10856 &>/dev/null; then
    echo "✅ Federation Dashboard is healthy"
else
    echo "⚠️  Federation Dashboard not ready yet (this is normal)"
fi

echo ""
echo "🎉 MCP Federation setup complete!"
echo ""
echo "🌐 Access points:"
echo "   Dashboard:     http://localhost:10856"
echo "   API:           http://localhost:10857"
echo "   API Docs:      http://localhost:10857/docs"
echo "   Health Check:  http://localhost:10857/health"
echo ""
echo "📝 Next steps:"
echo "1. Start your MCP servers (Tapo, Ring, Home Assistant, Netatmo)"
echo "2. The dashboard will automatically discover and display them"
echo "3. Use the unified interface to control all your smart home devices"
echo ""
echo "📚 Documentation:"
echo "   Federation Guide: docs/federation-overview.md"
echo "   API Reference:    http://localhost:8880/docs"
echo "   Troubleshooting:  docs/troubleshooting.md"
echo ""
echo "🛑 To stop: docker-compose down"
echo "🔄 To restart: docker-compose restart"