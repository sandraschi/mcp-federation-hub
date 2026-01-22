# MCP Federation Hub

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/)
[![Node.js](https://img.shields.io/badge/node.js-18+-green.svg)](https://nodejs.org/)

**Unified orchestration layer for MCP (Model Context Protocol) server ecosystems**

The MCP Federation Hub provides a centralized way to discover, manage, and interact with multiple MCP servers across your development environment. It federates existing MCP server repositories without modifying them, providing unified dashboards, documentation, and cross-server capabilities.

## 🏗️ Architecture

```
MCP Federation Hub
├── 📊 Unified Dashboard (React) - Port 3000
│   ├── Server discovery and health monitoring
│   ├── Cross-server data aggregation
│   ├── Unified control interfaces
│   └── Real-time status updates
│
├── 🔀 Federation Bridge (FastAPI) - Port 8000
│   ├── MCP request routing
│   ├── Server health monitoring
│   ├── Cross-server communication
│   └── API aggregation
│
└── 📚 Documentation Hub - Port 4000
    ├── Server catalog and capabilities
    ├── Integration guides
    ├── API documentation
    └── Interactive playground
```

## 🚀 Quick Start

### Prerequisites
- Python 3.9+
- Node.js 18+
- Docker (optional, for containerized deployment)

### Installation

```bash
# Clone the federation hub
git clone https://github.com/yourusername/mcp-federation-hub.git
cd mcp-federation-hub

# Install Python dependencies
pip install -r requirements.txt

# Install Node.js dependencies
cd dashboard && npm install && cd ..

# Start the federation services
docker-compose up -d
```

### Access Points

- **Unified Dashboard**: http://localhost:3330
- **Federation API**: http://localhost:8880
- **API Documentation**: http://localhost:8880/docs
- **Documentation Hub**: http://localhost:4440

## 📊 Server Ecosystem

The federation currently orchestrates **4 showcase MCP servers** across **3 categories**:

### Smart Home (2 servers)
| Server | Capabilities | Status |
|--------|-------------|---------|
| **Tapo Camera MCP** | Camera streaming, PTZ control, smart plugs, energy monitoring | ✅ Active |
| **Home Assistant MCP** | Device control, automation, climate, lighting, security | ✅ Active |

### Security (1 server)
| Server | Capabilities | Status |
|--------|-------------|---------|
| **Ring MCP** | Doorbell camera, motion detection, video recording, two-way audio | ✅ Active |

### Weather (1 server)
| Server | Capabilities | Status |
|--------|-------------|---------|
| **Netatmo Weather MCP** | Weather monitoring, indoor air quality, environmental sensors | ✅ Active |

## 🔧 Federation Features

### Unified Dashboard
- **Server Health Monitoring**: Real-time status of all federated servers
- **Cross-Server Views**: Cameras from Tapo + Ring in one interface
- **Aggregated Data**: Combined energy usage, security events, weather data
- **Unified Controls**: Control devices across multiple servers

### Federation Bridge
- **MCP Request Routing**: Routes tool calls to appropriate servers
- **Health Monitoring**: Continuous server health checking
- **Load Balancing**: Distributes requests across server instances
- **Error Handling**: Graceful degradation when servers are unavailable

### Documentation Hub
- **Server Catalog**: Comprehensive list of capabilities and tools
- **Integration Guides**: Step-by-step setup instructions
- **API Playground**: Interactive testing of MCP server tools
- **Performance Metrics**: Response times and reliability data

## 🛠️ Development

### Project Structure

```
federation-hub/
├── bridge/                      # Federation bridge (FastAPI)
│   ├── app/
│   │   ├── main.py             # FastAPI application
│   │   ├── routers/            # API endpoints
│   │   ├── services/           # Business logic
│   │   └── models/             # Data models
│   └── tests/
│
├── dashboard/                   # Unified dashboard (React)
│   ├── src/
│   │   ├── components/         # React components
│   │   ├── pages/              # Dashboard pages
│   │   ├── services/           # API clients
│   │   └── types/              # TypeScript types
│   └── public/
│
├── docs/                        # Documentation hub
│   ├── content/                 # Markdown content
│   ├── static/                  # Static assets
│   └── config/                  # Documentation config
│
├── shared/                      # Shared utilities
│   ├── config/                  # Federation configuration
│   ├── discovery/               # Server discovery
│   ├── monitoring/              # Health monitoring
│   └── testing/                 # Test utilities
│
├── docker/                      # Container definitions
├── scripts/                     # Utility scripts
├── tests/                       # Integration tests
└── federation-config.json       # Server registry
```

### Development Workflow

```bash
# Start all services in development mode
docker-compose -f docker-compose.dev.yml up

# Run tests
python -m pytest tests/

# Build documentation
cd docs && npm run build

# Format code
black bridge/ shared/
npx prettier --write dashboard/src/
```

### Adding New Servers

1. **Update Federation Config**:
```json
{
  "servers": {
    "new-server-mcp": {
      "id": "new-server-mcp",
      "name": "New Server MCP",
      "repository": "https://github.com/user/new-server-mcp",
      "mcp_endpoint": "http://localhost:7790",
      "capabilities": ["feature1", "feature2"]
    }
  }
}
```

2. **Update Categories**:
```json
{
  "categories": {
    "new-category": ["new-server-mcp"]
  }
}
```

3. **Test Integration**:
```bash
# Test server discovery
python scripts/test_server_discovery.py new-server-mcp

# Test health monitoring
python scripts/test_health_monitoring.py
```

## 🧪 Testing

### Unit Tests
```bash
# Test federation bridge
cd bridge && python -m pytest tests/

# Test dashboard components
cd dashboard && npm test
```

### Integration Tests
```bash
# Test cross-server communication
python tests/integration/test_federation_bridge.py

# Test dashboard API integration
python tests/integration/test_dashboard_api.py
```

### End-to-End Tests
```bash
# Test complete federation workflow
python tests/e2e/test_full_federation.py
```

## 📋 API Reference

### Federation Bridge API

#### Server Management
```http
GET    /api/v1/servers              # List all servers
GET    /api/v1/servers/{id}         # Get server details
GET    /api/v1/servers/{id}/health  # Check server health
```

#### MCP Tool Routing
```http
POST   /api/v1/tools/call           # Route tool call to server
GET    /api/v1/tools/{server_id}    # List server tools
```

#### Federation Features
```http
GET    /api/v1/federation/health    # Overall federation health
GET    /api/v1/federation/metrics   # Performance metrics
POST   /api/v1/federation/discover  # Discover new servers
```

All endpoints are available at `http://localhost:8880`

## 🔧 Configuration

### Environment Variables

```bash
# Federation Bridge
FEDERATION_PORT=8000
FEDERATION_HOST=0.0.0.0
CONFIG_FILE=federation-config.json

# Dashboard
REACT_APP_API_URL=http://localhost:8000
REACT_APP_DOCS_URL=http://localhost:4000

# Monitoring
HEALTH_CHECK_INTERVAL=30
METRICS_RETENTION_DAYS=7
```

### Federation Config Schema

```json
{
  "federation": {
    "name": "string",
    "version": "string",
    "ports": {
      "dashboard": "number",
      "bridge": "number",
      "docs": "number"
    }
  },
  "servers": {
    "server-id": {
      "id": "string",
      "name": "string",
      "repository": "url",
      "category": "string",
      "tier": "showcase|community|experimental",
      "mcp_endpoint": "url",
      "web_interface": "url",
      "health_endpoint": "url",
      "capabilities": ["string"],
      "tools": ["string"],
      "resources": ["string"],
      "status": "active|inactive",
      "last_verified": "date"
    }
  }
}
```

## 🚀 Deployment

### Docker Deployment
```bash
# Build and deploy
docker-compose build
docker-compose up -d

# Scale federation bridge
docker-compose up -d --scale bridge=3
```

### Kubernetes Deployment
```bash
# Deploy to Kubernetes
kubectl apply -f k8s/

# Check status
kubectl get pods -l app=federation-hub
```

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Clone your fork
3. Set up development environment
4. Create a feature branch
5. Make your changes
6. Run tests and linting
7. Submit a pull request

### Adding New Federation Features
1. Discuss the feature in an issue
2. Implement in appropriate service (bridge/dashboard/docs)
3. Add comprehensive tests
4. Update documentation
5. Update federation config if needed

## 📊 Monitoring & Metrics

### Health Monitoring
- Server availability and response times
- Federation bridge performance
- Dashboard responsiveness
- Cross-server communication latency

### Performance Metrics
- Request throughput and latency
- Error rates and success rates
- Resource usage (CPU, memory, network)
- Cache hit rates and efficiency

### Business Metrics
- Active servers and users
- Feature usage and adoption
- Integration success rates
- Community growth and engagement

## 🔒 Security

### Authentication & Authorization
- API key authentication for federation endpoints
- Role-based access control
- Server authentication verification
- Secure communication channels

### Data Protection
- Encryption of sensitive configuration
- Secure credential management
- Audit logging of all operations
- Regular security updates

## 📚 Documentation

### User Documentation
- [Getting Started Guide](docs/getting-started.md)
- [Server Integration Guide](docs/integration.md)
- [API Reference](http://localhost:8880/docs)
- [Troubleshooting](docs/troubleshooting.md)

### Developer Documentation
- [Architecture Overview](docs/architecture.md)
- [Contributing Guide](CONTRIBUTING.md)
- [Development Setup](docs/development.md)
- [Testing Guide](docs/testing.md)

## 🏆 Roadmap

### Phase 1 (Current): Foundation ✅
- [x] Federation registry and configuration
- [x] Basic bridge and dashboard
- [x] Server health monitoring
- [x] Documentation structure

### Phase 2 (Next): Enhancement
- [ ] Advanced cross-server queries
- [ ] Performance optimization
- [ ] Enhanced monitoring and alerting
- [ ] Plugin system for custom features

### Phase 3: Scale
- [ ] Multi-region deployment
- [ ] Advanced load balancing
- [ ] Enterprise features
- [ ] Community marketplace

## 🙏 Acknowledgments

This federation hub builds upon the incredible work of the MCP community. Special thanks to:

- The MCP protocol creators and maintainers
- All MCP server developers in the ecosystem
- Contributors to federation and orchestration technologies

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Federating MCP servers for unified smart home control and beyond!** 🏠🤖✨

*Built with ❤️ for the MCP ecosystem*