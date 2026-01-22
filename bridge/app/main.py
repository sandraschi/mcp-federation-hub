#!/usr/bin/env python3
"""
MCP Federation Bridge - FastAPI Backend
Routes MCP requests to appropriate servers in the federation
"""

import asyncio
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import httpx
import uvicorn

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="MCP Federation Bridge",
    description="Unified API for MCP server federation",
    version="1.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:3002", "http://localhost:3003"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global federation state
federation_config: Dict[str, Any] = {}
server_health_cache: Dict[str, Dict[str, Any]] = {}
health_check_interval = 30  # seconds

# Import sampling and AI services
try:
    from .sampling import federation_sampler, intelligent_route_request
    from .ai_service import AIService
    ai_service = AIService()
    sampling_enabled = True
    print("✅ FastMCP sampling enabled")
except ImportError as e:
    print(f"Warning: FastMCP sampling not available: {e}, running in basic mode")
    federation_sampler = None
    ai_service = None
    sampling_enabled = False

class FederationManager:
    """Manages the MCP server federation"""

    def __init__(self, config_path: Path):
        self.config_path = config_path
        self.config: Dict[str, Any] = {}
        self.servers: Dict[str, Dict[str, Any]] = {}
        self.categories: Dict[str, List[str]] = {}
        self._load_config()

    def _load_config(self):
        """Load federation configuration"""
        try:
            with open(self.config_path, 'r') as f:
                self.config = json.load(f)

            self.servers = self.config.get("servers", {})
            self.categories = self.config.get("categories", {})
            logger.info(f"Loaded federation config with {len(self.servers)} servers")

        except Exception as e:
            logger.error(f"Failed to load federation config: {e}")
            self.servers = {}
            self.categories = {}

    def get_server_config(self, server_id: str) -> Optional[Dict[str, Any]]:
        """Get configuration for a specific server"""
        return self.servers.get(server_id)

    def list_servers(self) -> List[Dict[str, Any]]:
        """List all servers in the federation"""
        return list(self.servers.values())

    def list_servers_by_category(self, category: str) -> List[Dict[str, Any]]:
        """List servers in a specific category"""
        server_ids = self.categories.get(category, [])
        return [self.servers[server_id] for server_id in server_ids if server_id in self.servers]

    async def check_server_health(self, server_config: Dict[str, Any]) -> Dict[str, Any]:
        """Check health of a specific server"""
        server_id = server_config["id"]
        health_endpoint = server_config.get("health_endpoint")

        if not health_endpoint:
            return {
                "server_id": server_id,
                "status": "unknown",
                "timestamp": datetime.now().isoformat(),
                "error": "No health endpoint configured"
            }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                start_time = datetime.now()
                response = await client.get(health_endpoint)
                response_time = (datetime.now() - start_time).total_seconds() * 1000

                if response.status_code == 200:
                    try:
                        health_data = response.json()
                        return {
                            "server_id": server_id,
                            "status": "healthy",
                            "response_time": round(response_time, 2),
                            "timestamp": datetime.now().isoformat(),
                            "details": health_data
                        }
                    except:
                        return {
                            "server_id": server_id,
                            "status": "healthy",
                            "response_time": round(response_time, 2),
                            "timestamp": datetime.now().isoformat()
                        }
                else:
                    return {
                        "server_id": server_id,
                        "status": "unhealthy",
                        "response_time": round(response_time, 2),
                        "timestamp": datetime.now().isoformat(),
                        "error": f"HTTP {response.status_code}"
                    }

        except Exception as e:
            return {
                "server_id": server_id,
                "status": "unreachable",
                "timestamp": datetime.now().isoformat(),
                "error": str(e)
            }

# Initialize federation manager
config_path = Path(__file__).parent.parent.parent / "federation-config.json"
federation_manager = FederationManager(config_path)

# Pydantic models for API
class ToolCallRequest(BaseModel):
    server_id: str = Field(..., description="ID of the target MCP server")
    tool_name: str = Field(..., description="Name of the tool to call")
    arguments: Dict[str, Any] = Field(default={}, description="Tool arguments")

class ServerInfo(BaseModel):
    id: str
    name: str
    description: str
    category: str
    tier: str
    mcp_endpoint: str
    web_interface: Optional[str]
    capabilities: List[str]
    tools: List[str]
    resources: List[str]
    status: str

class HealthStatus(BaseModel):
    server_id: str
    status: str
    response_time: Optional[float]
    timestamp: str
    error: Optional[str]
    details: Optional[Dict[str, Any]]

# API Routes

@app.get("/health")
async def health_check():
    """Basic health check"""
    return {
        "status": "healthy",
        "service": "MCP Federation Bridge",
        "timestamp": datetime.now().isoformat(),
        "federation": {
            "servers": len(federation_manager.servers),
            "categories": len(federation_manager.categories)
        }
    }

@app.get("/api/v1/servers")
async def list_servers():
    """List all servers in the federation"""
    servers = federation_manager.list_servers()
    return {"servers": servers, "total": len(servers)}

@app.get("/api/v1/servers/{server_id}")
async def get_server(server_id: str):
    """Get details for a specific server"""
    server = federation_manager.get_server_config(server_id)
    if not server:
        raise HTTPException(status_code=404, detail=f"Server {server_id} not found")

    return server

@app.get("/api/v1/servers/{server_id}/health")
async def check_server_health(server_id: str):
    """Check health of a specific server"""
    server = federation_manager.get_server_config(server_id)
    if not server:
        raise HTTPException(status_code=404, detail=f"Server {server_id} not found")

    health = await federation_manager.check_server_health(server)
    return health

@app.get("/api/v1/categories/{category}/servers")
async def list_servers_by_category(category: str):
    """List servers in a specific category"""
    servers = federation_manager.list_servers_by_category(category)
    return {"category": category, "servers": servers, "total": len(servers)}

@app.get("/api/v1/federation/health")
async def federation_health():
    """Get overall federation health"""
    server_health_checks = []

    for server_config in federation_manager.list_servers():
        health = await federation_manager.check_server_health(server_config)
        server_health_checks.append(health)

    # Summarize health status
    healthy_count = sum(1 for h in server_health_checks if h["status"] == "healthy")
    total_count = len(server_health_checks)

    return {
        "federation_status": "healthy" if healthy_count > 0 else "degraded",
        "total_servers": total_count,
        "healthy_servers": healthy_count,
        "unhealthy_servers": total_count - healthy_count,
        "server_health": server_health_checks,
        "timestamp": datetime.now().isoformat()
    }

@app.post("/api/v1/tools/call")
async def call_federated_tool(request: ToolCallRequest):
    """Route a tool call to the appropriate MCP server"""
    server_config = federation_manager.get_server_config(request.server_id)
    if not server_config:
        raise HTTPException(status_code=404, detail=f"Server {request.server_id} not found")

    mcp_endpoint = server_config.get("mcp_endpoint")
    if not mcp_endpoint:
        raise HTTPException(status_code=500, detail=f"No MCP endpoint configured for {request.server_id}")

    # Use AI-powered routing if available and enabled
    if sampling_enabled and ai_service and request.server_id == "auto":
        # Intelligent routing - find best server for this tool
        routing_decision = await ai_service.suggest_routing_strategy(
            federation_manager.list_servers(),
            f"Execute tool: {request.tool_name} with args: {json.dumps(request.arguments)}"
        )

        if routing_decision["primary_server"]:
            server_config = federation_manager.get_server_config(routing_decision["primary_server"])
            mcp_endpoint = server_config.get("mcp_endpoint") if server_config else None
            logger.info(f"AI routing: {request.tool_name} -> {routing_decision['primary_server']} (confidence: {routing_decision['confidence']})")

    # Construct MCP request
    mcp_request = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": request.tool_name,
            "arguments": request.arguments
        }
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                mcp_endpoint,
                json=mcp_request,
                headers={"Content-Type": "application/json"}
            )

            if response.status_code == 200:
                return response.json()
            else:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"MCP server error: {response.text}"
                )

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="MCP server timeout")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Cannot connect to MCP server")
    except Exception as e:
        logger.error(f"Error calling MCP tool: {e}")
        raise HTTPException(status_code=500, detail=f"MCP call failed: {str(e)}")

@app.get("/api/v1/federation/metrics")
async def federation_metrics():
    """Get federation performance metrics"""
    # This would track actual metrics in a production system
    return {
        "uptime": "simulated",
        "total_requests": 0,
        "successful_requests": 0,
        "failed_requests": 0,
        "average_response_time": 0.0,
        "server_metrics": {},
        "ai_enabled": ai_service is not None,
        "sampling_enabled": sampling_enabled
    }

# AI-powered endpoints
@app.get("/api/v1/ai/providers")
async def get_ai_providers():
    """Get available AI providers"""
    if not ai_service:
        return {"providers": {}, "status": "AI service not available"}

    return {
        "providers": ai_service.get_available_providers(),
        "status": "available"
    }

@app.post("/api/v1/ai/analyze-server")
async def analyze_server(server_id: str):
    """AI-powered server capability analysis"""
    if not ai_service:
        raise HTTPException(status_code=503, detail="AI service not available")

    server_config = federation_manager.get_server_config(server_id)
    if not server_config:
        raise HTTPException(status_code=404, detail=f"Server {server_id} not found")

    analysis = await ai_service.analyze_server_capabilities(server_config)
    return analysis

@app.post("/api/v1/ai/suggest-routing")
async def suggest_routing(user_intent: str):
    """AI-powered routing suggestions"""
    if not ai_service:
        raise HTTPException(status_code=503, detail="AI service not available")

    servers = federation_manager.list_servers()
    routing = await ai_service.suggest_routing_strategy(servers, user_intent)
    return routing

@app.get("/api/v1/ai/optimize-config")
async def optimize_config():
    """AI-powered federation configuration optimization"""
    if not ai_service:
        raise HTTPException(status_code=503, detail="AI service not available")

    config = federation_manager.config
    optimizations = await ai_service.optimize_federation_config(config)
    return optimizations

# Sampling-powered endpoints
@app.get("/api/v1/sampling/health-analysis")
async def sampling_health_analysis():
    """FastMCP 2.14.3 sampling-based health analysis"""
    if not sampling_enabled:
        raise HTTPException(status_code=503, detail="Sampling service not available")

    from .sampling import analyze_federation_health
    # This would call the FastMCP sampling tool
    return await analyze_federation_health()  # ctx would be passed in real implementation

@app.get("/api/v1/sampling/optimize-config")
async def sampling_optimize_config():
    """FastMCP 2.14.3 sampling-based optimization"""
    if not sampling_enabled:
        raise HTTPException(status_code=503, detail="Sampling service not available")

    from .sampling import optimize_federation_config
    return await optimize_federation_config()  # ctx would be passed in real implementation

@app.post("/api/v1/sampling/sample-servers")
async def sample_servers_for_capability(capability: str, count: int = 3):
    """Sample servers by capability using FastMCP 2.14.3 sampling"""
    if not sampling_enabled or not federation_sampler:
        raise HTTPException(status_code=503, detail="Sampling service not available")

    servers = await federation_sampler.sample_servers_by_capability(capability, count)
    return {"capability": capability, "sampled_servers": servers, "count": len(servers)}

@app.post("/api/v1/sampling/intelligent-routing")
async def intelligent_routing(request_type: str, parameters: Dict[str, Any]):
    """Intelligent routing using FastMCP 2.14.3 sampling"""
    if not sampling_enabled or not federation_sampler:
        raise HTTPException(status_code=503, detail="Sampling service not available")

    routing = await federation_sampler.intelligent_routing(request_type, parameters)
    return routing

# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.status_code,
                "message": exc.detail,
                "type": "http_error"
            },
            "timestamp": datetime.now().isoformat()
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": 500,
                "message": "Internal server error",
                "type": "server_error"
            },
            "timestamp": datetime.now().isoformat()
        }
    )

if __name__ == "__main__":
    # Use port from federation config
    config_port = federation_manager.config.get("federation", {}).get("ports", {}).get("bridge", 8000)
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=config_port,
        reload=True,
        log_level="info"
    )