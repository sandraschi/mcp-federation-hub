"""
FastMCP 3.0 Sampling Service for Intelligent Federation
"""

import logging
from typing import Dict, List, Any, Optional
from dataclasses import dataclass

from fastmcp import FastMCP
from fastmcp.sampling import SamplingService, SamplingContext


from .main import federation_manager

# Configure logging
logger = logging.getLogger(__name__)

# Initialize FastMCP app with sampling
app = FastMCP("federation-sampling")

# Sampling service for intelligent orchestration
sampling_service = SamplingService()


@dataclass
class ServerCapability:
    server_id: str
    capabilities: List[str]
    tools: List[str]
    health_score: float
    response_time: float


class FederationSampler:
    """Intelligent sampling for MCP federation"""

    def __init__(self):
        self.server_cache: Dict[str, ServerCapability] = {}
        self.cache_ttl = 300  # 5 minutes

    async def get_server_capabilities(
        self, server_id: str
    ) -> Optional[ServerCapability]:
        """Get cached server capabilities"""
        if server_id in self.server_cache:
            return self.server_cache[server_id]

        # Fetch fresh data
        server_config = federation_manager.get_server_config(server_id)
        if not server_config:
            return None

        # Check health
        try:
            health = await federation_manager.check_server_health(server_config)
            health_score = 1.0 if health["status"] == "healthy" else 0.5
            response_time = (
                health.get("response_time", 1000) / 1000
            )  # Convert to seconds
        except Exception as e:
            logger.error(f"Error checking health for {server_id}: {e}")
            health_score = 0.0
            response_time = 10.0  # High penalty for unreachable

        capability = ServerCapability(
            server_id=server_id,
            capabilities=server_config.get("capabilities", []),
            tools=server_config.get("tools", []),
            health_score=health_score,
            response_time=response_time,
        )

        self.server_cache[server_id] = capability
        return capability

    async def sample_servers_by_capability(
        self, capability: str, count: int = 3, min_health_score: float = 0.5
    ) -> List[str]:
        """Sample servers that have a specific capability"""
        candidates = []

        for server_config in federation_manager.list_servers():
            server_id = server_config["id"]

            # Check if server has the capability
            if capability not in server_config.get("capabilities", []):
                continue

            # Get capability data
            cap_data = await self.get_server_capabilities(server_id)
            if not cap_data or cap_data.health_score < min_health_score:
                continue

            # Calculate fitness score (health + speed)
            fitness_score = cap_data.health_score * 2.0 - cap_data.response_time * 0.1
            candidates.append((server_id, fitness_score))

        # Sort by fitness score (descending)
        candidates.sort(key=lambda x: x[1], reverse=True)

        # Return top candidates
        return [server_id for server_id, _ in candidates[:count]]

    async def sample_servers_by_tool(self, tool_name: str, count: int = 3) -> List[str]:
        """Sample servers that provide a specific tool"""
        candidates = []

        for server_config in federation_manager.list_servers():
            server_id = server_config["id"]

            # Check if server has the tool
            if tool_name not in server_config.get("tools", []):
                continue

            # Get capability data
            cap_data = await self.get_server_capabilities(server_id)
            if not cap_data or cap_data.health_score < 0.5:
                continue

            # Calculate fitness score
            fitness_score = cap_data.health_score * 2.0 - cap_data.response_time * 0.1
            candidates.append((server_id, fitness_score))

        # Sort by fitness score (descending)
        candidates.sort(key=lambda x: x[1], reverse=True)

        return [server_id for server_id, _ in candidates[:count]]

    async def intelligent_routing(
        self, request_type: str, parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Intelligent routing based on request analysis"""

        if request_type == "tool_call":
            tool_name = parameters.get("tool_name", "")
            servers = await self.sample_servers_by_tool(tool_name, count=3)

            return {
                "strategy": "load_balanced",
                "primary_server": servers[0] if servers else None,
                "fallback_servers": servers[1:] if len(servers) > 1 else [],
                "confidence": len(servers) / 3.0,  # Higher confidence with more options
                "reasoning": f"Selected {len(servers)} servers capable of {tool_name}",
            }

        elif request_type == "capability_search":
            capability = parameters.get("capability", "")
            servers = await self.sample_servers_by_capability(capability, count=5)

            return {
                "strategy": "capability_match",
                "servers": servers,
                "total_matches": len(servers),
                "reasoning": f"Found {len(servers)} servers with {capability} capability",
            }

        else:
            # Default routing
            all_servers = [s["id"] for s in federation_manager.list_servers()]
            return {
                "strategy": "round_robin",
                "servers": all_servers[:3],
                "reasoning": "Default round-robin routing",
            }


# Initialize sampler
federation_sampler = FederationSampler()


# FastMCP Tools with Sampling
@app.tool()
async def sample_servers_for_capability(
    capability: str, ctx: SamplingContext, count: int = 3
) -> List[str]:
    """
    Sample servers that have a specific capability using intelligent scoring.

    Uses FastMCP 3.0 sampling to find the best servers for a given capability
    based on health, performance, and capability matching.
    """
    return await federation_sampler.sample_servers_by_capability(capability, count)


@app.tool()
async def sample_servers_for_tool(
    tool_name: str, ctx: SamplingContext, count: int = 3
) -> List[str]:
    """
    Sample servers that provide a specific tool using intelligent scoring.

    Uses FastMCP 3.0 sampling to find the best servers for a given tool
    based on health, performance, and tool availability.
    """
    return await federation_sampler.sample_servers_by_tool(tool_name, count)


@app.tool()
async def intelligent_route_request(
    request_type: str, parameters: Dict[str, Any] = None, ctx: SamplingContext = None
) -> Dict[str, Any]:
    """
    Intelligently route a request to the best available servers.

    Uses FastMCP 3.0 sampling to analyze the request and determine
    optimal server selection based on capabilities, health, and performance.
    """
    return await federation_sampler.intelligent_routing(request_type, parameters)


@app.tool()
async def analyze_federation_health(ctx: SamplingContext = None) -> Dict[str, Any]:
    """
    Analyze overall federation health using sampling techniques.

    Uses FastMCP 3.0 sampling to gather comprehensive health data
    across all servers and provide intelligent insights.
    """
    health_data = []
    total_servers = len(federation_manager.list_servers())

    for server_config in federation_manager.list_servers():
        server_id = server_config["id"]
        try:
            health = await federation_manager.check_server_health(server_config)
            cap_data = await federation_sampler.get_server_capabilities(server_id)

            health_data.append(
                {
                    "server_id": server_id,
                    "status": health["status"],
                    "response_time": health.get("response_time", 0),
                    "health_score": cap_data.health_score if cap_data else 0,
                    "capabilities": len(server_config.get("capabilities", [])),
                    "tools": len(server_config.get("tools", [])),
                }
            )
        except Exception as e:
            health_data.append(
                {"server_id": server_id, "status": "error", "error": str(e)}
            )

    healthy_count = sum(1 for h in health_data if h["status"] == "healthy")

    return {
        "federation_health": "healthy"
        if healthy_count / total_servers > 0.8
        else "degraded",
        "total_servers": total_servers,
        "healthy_servers": healthy_count,
        "average_response_time": sum(h.get("response_time", 0) for h in health_data)
        / len(health_data),
        "server_details": health_data,
        "recommendations": [
            "Consider load balancing across healthy servers"
            if healthy_count > 1
            else "Monitor server health",
            "Review response times for performance optimization"
            if any(h.get("response_time", 0) > 1000 for h in health_data)
            else "Response times look good",
            f"Expand capabilities: {total_servers} servers provide diverse functionality"
            if total_servers >= 3
            else "Consider adding more servers for redundancy",
        ],
    }


@app.tool()
async def optimize_federation_config(ctx: SamplingContext = None) -> Dict[str, Any]:
    """
    Provide optimization suggestions for federation configuration.

    Uses FastMCP 3.0 sampling to analyze current configuration
    and suggest improvements for performance and reliability.
    """
    config = federation_manager.config

    # Analyze current setup
    server_count = len(config.get("servers", {}))
    categories = config.get("categories", {})

    suggestions = []

    # Health check frequency optimization
    if server_count > 10:
        suggestions.append("Increase health check interval to reduce overhead")
    else:
        suggestions.append("Current health check frequency is appropriate")

    # Load balancing suggestions
    if server_count >= 3:
        suggestions.append("Enable load balancing across similar servers")
        suggestions.append("Implement failover strategies")
    else:
        suggestions.append("Consider adding more servers for redundancy")

    # Caching recommendations
    if any(len(servers) > 5 for servers in categories.values()):
        suggestions.append("Implement server response caching")
        suggestions.append("Add rate limiting for high-traffic servers")

    return {
        "current_config": {
            "servers": server_count,
            "categories": len(categories),
            "federation_features": config.get("federation_features", {}),
        },
        "optimization_suggestions": suggestions,
        "performance_recommendations": [
            "Monitor server response times for bottleneck identification",
            "Implement circuit breakers for unreliable servers",
            "Consider geographic distribution for global deployments",
        ],
        "scaling_guidance": {
            "max_servers_recommended": 50,
            "optimal_health_check_interval": "30-60 seconds",
            "cache_ttl_recommended": "5-15 minutes",
        },
    }


# Export sampling service for use in main app
__all__ = ["app", "sampling_service", "federation_sampler", "FederationSampler"]
