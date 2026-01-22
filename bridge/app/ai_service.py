"""
AI Service for Intelligent Federation Orchestration
"""

import os
import json
from typing import Dict, List, Any, Optional
from openai import OpenAI
import httpx

class AIService:
    """AI service for intelligent federation orchestration"""

    def __init__(self):
        self.openai_client = None
        self.ollama_available = False

        # Initialize OpenAI if key available
        openai_key = os.getenv("OPENAI_API_KEY")
        if openai_key:
            self.openai_client = OpenAI(api_key=openai_key)

        # Check Ollama availability
        try:
            response = httpx.get("http://localhost:11434/api/tags", timeout=2.0)
            self.ollama_available = response.status_code == 200
        except:
            self.ollama_available = False

    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        provider: str = "ollama",
        model: str = "llama2",
        temperature: float = 0.7
    ) -> Dict[str, Any]:
        """Make AI chat completion request"""

        if provider == "openai" and self.openai_client:
            try:
                response = await self.openai_client.chat.completions.acreate(
                    model=model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=2000
                )

                return {
                    "content": response.choices[0].message.content,
                    "provider": "openai",
                    "model": model,
                    "usage": response.usage.__dict__ if response.usage else None
                }
            except Exception as e:
                print(f"OpenAI error: {e}")
                return {"error": str(e)}

        elif provider == "ollama" and self.ollama_available:
            try:
                payload = {
                    "model": model,
                    "messages": messages,
                    "options": {
                        "temperature": temperature,
                        "num_predict": 2000
                    }
                }

                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        "http://localhost:11434/api/chat",
                        json=payload,
                        timeout=30.0
                    )

                    if response.status_code == 200:
                        data = response.json()
                        return {
                            "content": data.get("message", {}).get("content", ""),
                            "provider": "ollama",
                            "model": model,
                            "usage": data.get("eval_count")
                        }
                    else:
                        return {"error": f"Ollama API error: {response.status_code}"}

            except Exception as e:
                print(f"Ollama error: {e}")
                return {"error": str(e)}

        else:
            return {"error": f"AI provider {provider} not available"}

    async def analyze_server_capabilities(self, server_config: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze server capabilities using AI"""

        prompt = f"""Analyze this MCP server's capabilities and provide orchestration insights:

Server: {server_config.get('name', 'Unknown')}
Description: {server_config.get('description', 'No description')}
Capabilities: {', '.join(server_config.get('capabilities', []))}
Tools: {', '.join(server_config.get('tools', []))}
Category: {server_config.get('category', 'Unknown')}

Provide analysis in JSON format:
{{
  "primary_use_cases": ["use case 1", "use case 2"],
  "integration_opportunities": ["opportunity 1", "opportunity 2"],
  "performance_characteristics": "brief analysis",
  "security_considerations": ["consideration 1"],
  "reliability_rating": "high|medium|low",
  "scaling_recommendations": "brief advice"
}}"""

        messages = [
            {
                "role": "system",
                "content": "You are an expert MCP server analyst. Always return valid JSON."
            },
            {
                "role": "user",
                "content": prompt
            }
        ]

        response = await self.chat_completion(messages, temperature=0.3)

        if "error" in response:
            return {"error": response["error"]}

        try:
            analysis = json.loads(response["content"])
            return analysis
        except:
            return {"error": "Failed to parse AI response"}

    async def suggest_routing_strategy(
        self,
        servers: List[Dict[str, Any]],
        user_request: str
    ) -> Dict[str, Any]:
        """Suggest optimal routing strategy using AI"""

        server_info = "\n".join([
            f"- {s['id']}: {s.get('name', 'Unknown')} - {', '.join(s.get('capabilities', []))}"
            for s in servers
        ])

        prompt = f"""Given these MCP servers and a user request, suggest the optimal routing strategy:

Available Servers:
{server_info}

User Request: "{user_request}"

Return JSON with routing recommendation:
{{
  "strategy": "single_server|load_balanced|failover|cascade",
  "primary_server": "server_id",
  "fallback_servers": ["server_id1", "server_id2"],
  "reasoning": "explanation of choice",
  "confidence": 0.0-1.0,
  "expected_performance": "fast|medium|slow",
  "risk_assessment": "low|medium|high"
}}"""

        messages = [
            {
                "role": "system",
                "content": "You are an intelligent routing strategist for MCP federations. Always return valid JSON."
            },
            {
                "role": "user",
                "content": prompt
            }
        ]

        response = await self.chat_completion(messages, temperature=0.2)

        if "error" in response:
            # Fallback strategy
            return {
                "strategy": "single_server",
                "primary_server": servers[0]["id"] if servers else None,
                "fallback_servers": [],
                "reasoning": "AI unavailable, using fallback",
                "confidence": 0.5,
                "expected_performance": "medium",
                "risk_assessment": "medium"
            }

        try:
            strategy = json.loads(response["content"])
            return strategy
        except:
            return {
                "strategy": "round_robin",
                "primary_server": servers[0]["id"] if servers else None,
                "fallback_servers": servers[1:3] if len(servers) > 1 else [],
                "reasoning": "Fallback due to parsing error",
                "confidence": 0.5,
                "expected_performance": "medium",
                "risk_assessment": "medium"
            }

    async def optimize_federation_config(self, current_config: Dict[str, Any]) -> Dict[str, Any]:
        """Provide AI-powered federation optimization suggestions"""

        prompt = f"""Analyze this MCP federation configuration and suggest optimizations:

Current Configuration:
- Total Servers: {len(current_config.get('servers', {}))}
- Categories: {list(current_config.get('categories', {}).keys())}
- Federation Features: {list(current_config.get('federation_features', {}).keys())}

Provide optimization suggestions in JSON:
{{
  "performance_optimizations": ["optimization 1", "optimization 2"],
  "reliability_improvements": ["improvement 1", "improvement 2"],
  "scaling_recommendations": ["recommendation 1"],
  "monitoring_suggestions": ["suggestion 1"],
  "priority_level": "high|medium|low",
  "estimated_impact": "significant|moderate|minor"
}}"""

        messages = [
            {
                "role": "system",
                "content": "You are a federation optimization expert. Always return valid JSON."
            },
            {
                "role": "user",
                "content": prompt
            }
        ]

        response = await self.chat_completion(messages, temperature=0.1)

        if "error" in response:
            return {"error": response["error"]}

        try:
            optimizations = json.loads(response["content"])
            return optimizations
        except:
            return {
                "performance_optimizations": ["Monitor response times", "Implement caching"],
                "reliability_improvements": ["Add health checks", "Implement retries"],
                "scaling_recommendations": ["Consider load balancing"],
                "monitoring_suggestions": ["Add metrics collection"],
                "priority_level": "medium",
                "estimated_impact": "moderate"
            }

    def get_available_providers(self) -> Dict[str, bool]:
        """Check which AI providers are available"""
        return {
            "openai": self.openai_client is not None,
            "ollama": self.ollama_available
        }