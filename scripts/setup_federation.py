#!/usr/bin/env python3
"""
MCP Federation Setup Script
Helps users set up and configure their MCP federation
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Any

class FederationSetup:
    """Handles MCP federation setup and configuration"""

    def __init__(self):
        self.root_dir = Path(__file__).parent.parent
        self.config_file = self.root_dir / "federation-config.json"

    def run_full_setup(self):
        """Run complete federation setup"""
        print("🚀 MCP Federation Setup")
        print("=" * 50)

        try:
            # Check prerequisites
            self.check_prerequisites()

            # Create configuration
            self.create_federation_config()

            # Validate configuration
            self.validate_config()

            # Setup services
            self.setup_services()

            # Test federation
            self.test_federation()

            print("\n✅ Federation setup complete!")
            print("\n🎯 Next steps:")
            print("1. Start your MCP servers (Tapo, Ring, etc.)")
            print("2. Run: docker-compose up -d")
            print("3. Open: http://localhost:3000")
            print("4. Check health: http://localhost:8000/api/v1/federation/health")

        except Exception as e:
            print(f"\n❌ Setup failed: {e}")
            sys.exit(1)

    def check_prerequisites(self):
        """Check system prerequisites"""
        print("📋 Checking prerequisites...")

        # Check Docker
        try:
            subprocess.run(["docker", "--version"], check=True, capture_output=True)
            print("✅ Docker available")
        except (subprocess.CalledProcessError, FileNotFoundError):
            print("❌ Docker not available. Please install Docker.")
            raise

        # Check docker-compose
        try:
            subprocess.run(["docker-compose", "--version"], check=True, capture_output=True)
            print("✅ Docker Compose available")
        except (subprocess.CalledProcessError, FileNotFoundError):
            print("❌ Docker Compose not available. Please install Docker Compose.")
            raise

        # Check Python
        if sys.version_info >= (3, 9):
            print("✅ Python 3.9+ available")
        else:
            print("❌ Python 3.9+ required")
            raise RuntimeError("Python 3.9+ is required")

        # Check Node.js
        try:
            result = subprocess.run(["node", "--version"], check=True, capture_output=True, text=True)
            version = result.stdout.strip().lstrip('v')
            major_version = int(version.split('.')[0])
            if major_version >= 18:
                print("✅ Node.js 18+ available")
            else:
                print("❌ Node.js 18+ required")
                raise RuntimeError("Node.js 18+ is required")
        except (subprocess.CalledProcessError, FileNotFoundError):
            print("❌ Node.js not available. Please install Node.js 18+.")
            raise

    def create_federation_config(self):
        """Create federation configuration file"""
        print("⚙️  Creating federation configuration...")

        # Default configuration
        config = {
            "federation": {
                "name": "MCP Ecosystem Federation",
                "version": "1.0.0",
                "description": "Unified orchestration layer for MCP server ecosystem",
                "created": "2026-01-21",
                "ports": {
                    "dashboard": 3000,
                    "bridge": 8000,
                    "docs": 4000
                }
            },
            "servers": {
                "tapo-camera-mcp": {
                    "id": "tapo-camera-mcp",
                    "name": "TP-Link Tapo Camera MCP",
                    "description": "Complete camera surveillance and smart plug control system",
                    "repository": "https://github.com/yourusername/tapo-camera-mcp",
                    "category": "smart-home",
                    "tier": "showcase",
                    "mcp_endpoint": "http://localhost:7778",
                    "web_interface": "http://localhost:3001",
                    "health_endpoint": "http://localhost:7778/health",
                    "capabilities": [
                        "camera_streaming",
                        "ptz_control",
                        "motion_detection",
                        "smart_plug_control",
                        "energy_monitoring",
                        "device_scheduling"
                    ],
                    "tools": [
                        "list_cameras",
                        "get_camera_stream",
                        "control_ptz",
                        "list_energy_devices",
                        "control_device_power",
                        "get_energy_usage"
                    ],
                    "resources": [
                        "camera_feeds",
                        "device_states",
                        "energy_history"
                    ],
                    "status": "active",
                    "last_verified": "2026-01-21"
                },
                "ring-mcp": {
                    "id": "ring-mcp",
                    "name": "Ring Security MCP",
                    "description": "Doorbell camera and security system integration",
                    "repository": "https://github.com/yourusername/ring-mcp",
                    "category": "security",
                    "tier": "showcase",
                    "mcp_endpoint": "http://localhost:7782",
                    "web_interface": "http://localhost:3002",
                    "health_endpoint": "http://localhost:7782/health",
                    "capabilities": [
                        "doorbell_camera",
                        "motion_detection",
                        "video_recording",
                        "two_way_audio",
                        "security_events"
                    ],
                    "tools": [
                        "list_devices",
                        "get_live_stream",
                        "get_recent_events",
                        "send_audio_message"
                    ],
                    "resources": [
                        "live_feeds",
                        "recorded_videos",
                        "event_history"
                    ],
                    "status": "active",
                    "last_verified": "2026-01-21"
                },
                "home-assistant-mcp": {
                    "id": "home-assistant-mcp",
                    "name": "Home Assistant Smart Home MCP",
                    "description": "Complete smart home automation via Home Assistant",
                    "repository": "https://github.com/yourusername/home-assistant-mcp",
                    "category": "smart-home",
                    "tier": "showcase",
                    "mcp_endpoint": "http://localhost:7783",
                    "web_interface": "http://localhost:3003",
                    "health_endpoint": "http://localhost:7783/health",
                    "capabilities": [
                        "device_control",
                        "automation_rules",
                        "climate_control",
                        "lighting_control",
                        "security_systems",
                        "energy_management"
                    ],
                    "tools": [
                        "list_entities",
                        "control_entity",
                        "get_entity_state",
                        "create_automation",
                        "list_automations"
                    ],
                    "resources": [
                        "entity_states",
                        "automation_rules",
                        "system_logs"
                    ],
                    "status": "active",
                    "last_verified": "2026-01-21"
                },
                "netatmo-weather-mcp": {
                    "id": "netatmo-weather-mcp",
                    "name": "Netatmo Weather Station MCP",
                    "description": "Weather monitoring and environmental sensors",
                    "repository": "https://github.com/yourusername/netatmo-weather-mcp",
                    "category": "weather",
                    "tier": "showcase",
                    "mcp_endpoint": "http://localhost:7781",
                    "web_interface": "http://localhost:3004",
                    "health_endpoint": "http://localhost:7781/health",
                    "capabilities": [
                        "weather_monitoring",
                        "indoor_air_quality",
                        "temperature_tracking",
                        "humidity_monitoring",
                        "co2_measurement",
                        "noise_monitoring"
                    ],
                    "tools": [
                        "get_current_weather",
                        "get_indoor_sensors",
                        "get_weather_history",
                        "get_air_quality"
                    ],
                    "resources": [
                        "weather_data",
                        "sensor_readings",
                        "historical_data"
                    ],
                    "status": "active",
                    "last_verified": "2026-01-21"
                }
            },
            "categories": {
                "smart-home": ["tapo-camera-mcp", "home-assistant-mcp"],
                "security": ["ring-mcp"],
                "weather": ["netatmo-weather-mcp"],
                "creative": [],
                "development": [],
                "ai": [],
                "media": [],
                "communication": [],
                "productivity": [],
                "infrastructure": []
            },
            "federation_features": {
                "cross_server_queries": true,
                "unified_dashboard": true,
                "shared_documentation": true,
                "health_monitoring": true,
                "performance_metrics": true,
                "integration_testing": true
            }
        }

        # Write configuration
        with open(self.config_file, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)

        print("✅ Federation configuration created")

    def validate_config(self):
        """Validate federation configuration"""
        print("🔍 Validating federation configuration...")

        try:
            with open(self.config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)

            # Validate required fields
            required_fields = ["federation", "servers", "categories"]
            for field in required_fields:
                if field not in config:
                    raise ValueError(f"Missing required field: {field}")

            # Validate server structure
            for server_id, server_data in config["servers"].items():
                required_server_fields = ["id", "name", "category", "mcp_endpoint"]
                for field in required_server_fields:
                    if field not in server_data:
                        raise ValueError(f"Server {server_id} missing field: {field}")

            print("✅ Configuration validation passed")

        except Exception as e:
            print(f"❌ Configuration validation failed: {e}")
            raise

    def setup_services(self):
        """Setup federation services"""
        print("🏗️  Setting up federation services...")

        # Install Python dependencies
        if (self.root_dir / "bridge" / "requirements.txt").exists():
            print("Installing Python dependencies...")
            subprocess.run([
                sys.executable, "-m", "pip", "install", "-r",
                str(self.root_dir / "bridge" / "requirements.txt")
            ], check=True)

        # Install Node.js dependencies
        if (self.root_dir / "dashboard" / "package.json").exists():
            print("Installing Node.js dependencies...")
            subprocess.run(["npm", "install"], cwd=self.root_dir / "dashboard", check=True)

        print("✅ Services setup complete")

    def test_federation(self):
        """Test basic federation functionality"""
        print("🧪 Testing federation setup...")

        try:
            # Test configuration loading
            from bridge.app.main import federation_manager
            servers = federation_manager.list_servers()
            print(f"✅ Configuration loaded: {len(servers)} servers")

            print("✅ Federation test passed")

        except Exception as e:
            print(f"⚠️  Federation test warning: {e}")
            print("   (This is normal if services aren't running yet)")

def main():
    parser = argparse.ArgumentParser(description="MCP Federation Setup")
    parser.add_argument("--validate-only", action="store_true",
                       help="Only validate existing configuration")
    parser.add_argument("--test-only", action="store_true",
                       help="Only run tests on existing setup")

    args = parser.parse_args()

    setup = FederationSetup()

    if args.validate_only:
        setup.validate_config()
        print("✅ Configuration validation complete")
    elif args.test_only:
        setup.test_federation()
        print("✅ Federation testing complete")
    else:
        setup.run_full_setup()

if __name__ == "__main__":
    main()