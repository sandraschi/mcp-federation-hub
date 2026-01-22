import axios from 'axios';

// Create axios instance
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8880',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 404) {
      console.warn('API endpoint not found:', error.config.url);
    } else if (error.response?.status >= 500) {
      console.error('Server error:', error.response.data);
    } else if (error.code === 'NETWORK_ERROR') {
      console.error('Network error - Federation Bridge may be unavailable');
    }
    return Promise.reject(error);
  }
);

// API methods
export const federationApi = {
  // Health and status
  getHealth: async () => {
    const response = await api.get('/api/v1/federation/health');
    return response.data;
  },

  // Servers
  getServers: async () => {
    const response = await api.get('/api/v1/servers');
    return response.data;
  },

  getServer: async (serverId: string) => {
    const response = await api.get(`/api/v1/servers/${serverId}`);
    return response.data;
  },

  getServerHealth: async (serverId: string) => {
    const response = await api.get(`/api/v1/servers/${serverId}/health`);
    return response.data;
  },

  // Categories
  getServersByCategory: async (category: string) => {
    const response = await api.get(`/api/v1/categories/${category}/servers`);
    return response.data;
  },

  // Tools
  callTool: async (serverId: string, toolName: string, toolArguments: any = {}) => {
    const response = await api.post('/api/v1/tools/call', {
      server_id: serverId,
      tool_name: toolName,
      arguments: toolArguments
    });
    return response.data;
  },

  // Metrics
  getMetrics: async () => {
    const response = await api.get('/api/v1/federation/metrics');
    return response.data;
  },

  // AI Services
  getAIProviders: async () => {
    const response = await api.get('/api/v1/ai/providers');
    return response.data;
  },

  analyzeServer: async (serverId: string) => {
    const response = await api.post('/api/v1/ai/analyze-server', { server_id: serverId });
    return response.data;
  },

  suggestRouting: async (userIntent: string) => {
    const response = await api.post('/api/v1/ai/suggest-routing', { user_intent: userIntent });
    return response.data;
  },

  optimizeConfig: async () => {
    const response = await api.get('/api/v1/ai/optimize-config');
    return response.data;
  },

  // Sampling Services (FastMCP 2.14.3)
  samplingHealthAnalysis: async () => {
    const response = await api.get('/api/v1/sampling/health-analysis');
    return response.data;
  },

  samplingOptimizeConfig: async () => {
    const response = await api.get('/api/v1/sampling/optimize-config');
    return response.data;
  },

  sampleServersForCapability: async (capability: string, count: number = 3) => {
    const response = await api.post('/api/v1/sampling/sample-servers', { capability, count });
    return response.data;
  },

  intelligentRouting: async (requestType: string, parameters: any) => {
    const response = await api.post('/api/v1/sampling/intelligent-routing', { request_type: requestType, parameters });
    return response.data;
  }
};

export default api;