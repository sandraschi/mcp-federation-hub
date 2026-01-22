"""Tests for federation bridge health endpoints"""

import pytest
from httpx import AsyncClient
from fastapi.testclient import TestClient

from app.main import app


class TestHealthEndpoints:
    """Test health check endpoints"""

    def test_health_endpoint(self, client):
        """Test basic health endpoint"""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "service" in data
        assert "version" in data

    def test_federation_health_endpoint(self, client):
        """Test federation health endpoint"""
        response = client.get("/api/v1/federation/health")
        # May return error if no servers are configured, but should not crash
        assert response.status_code in [200, 503]

    def test_servers_endpoint(self, client):
        """Test servers listing endpoint"""
        response = client.get("/api/v1/servers")
        # May return empty list, but should not crash
        assert response.status_code in [200, 503]


class TestServerOperations:
    """Test server-related operations"""

    def test_get_server_not_found(self, client):
        """Test getting non-existent server"""
        response = client.get("/api/v1/servers/non-existent")
        assert response.status_code == 404

    def test_server_health_not_found(self, client):
        """Test health check for non-existent server"""
        response = client.get("/api/v1/servers/non-existent/health")
        assert response.status_code == 404


class TestToolOperations:
    """Test MCP tool operations"""

    def test_call_tool_invalid_server(self, client):
        """Test calling tool on invalid server"""
        response = client.post("/api/v1/tools/call", json={
            "server_id": "invalid-server",
            "tool_name": "test_tool",
            "arguments": {}
        })
        assert response.status_code == 404

    def test_call_tool_missing_data(self, client):
        """Test calling tool with missing required data"""
        response = client.post("/api/v1/tools/call", json={})
        assert response.status_code == 422  # Validation error


# Pytest fixtures
@pytest.fixture
def client():
    """Test client fixture"""
    return TestClient(app)


@pytest.fixture
async def async_client():
    """Async test client fixture"""
    async with AsyncClient(app=app, base_url="http://testserver") as client:
        yield client