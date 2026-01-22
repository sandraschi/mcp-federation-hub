// Federation Types
export interface Server {
  id: string;
  name: string;
  description: string;
  category: string;
  tier: 'showcase' | 'community' | 'experimental';
  mcp_endpoint: string;
  web_interface?: string;
  health_endpoint?: string;
  capabilities: string[];
  tools: string[];
  resources: string[];
  status: string;
  last_verified?: string;
}

export interface ServerHealth {
  server_id: string;
  status: 'healthy' | 'unhealthy' | 'unreachable' | 'unknown';
  response_time?: number;
  timestamp: string;
  error?: string;
  details?: any;
}

export interface FederationHealth {
  federation_status: 'healthy' | 'degraded' | 'unhealthy';
  total_servers: number;
  healthy_servers: number;
  unhealthy_servers: number;
  server_health: ServerHealth[];
  timestamp: string;
}

export interface CategoryInfo {
  name: string;
  server_count: number;
  servers: string[];
  capabilities: string[];
}

// API Response Types
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  timestamp?: string;
}

// Tool Call Types
export interface ToolCallRequest {
  server_id: string;
  tool_name: string;
  arguments: Record<string, any>;
}

export interface ToolCallResponse {
  result?: any;
  error?: {
    code: string;
    message: string;
  };
}

// Component Props Types
export interface ServerCardProps {
  server: Server;
  health?: ServerHealth;
}

export interface HealthSummaryProps {
  totalServers: number;
  healthyServers: number;
  unhealthyServers: number;
  federationStatus: string;
}