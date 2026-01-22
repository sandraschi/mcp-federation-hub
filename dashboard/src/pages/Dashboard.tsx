import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Server, CheckCircle, AlertTriangle, XCircle, Brain, Zap } from 'lucide-react';

// API
import { federationApi } from '../services/api';

// Components
import ServerCard from '../components/ServerCard';
import HealthSummary from '../components/HealthSummary';

const Dashboard: React.FC = () => {
  // Fetch federation health
  const { data: healthData, isLoading: healthLoading, error: healthError } = useQuery({
    queryKey: ['federation-health'],
    queryFn: federationApi.getHealth,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Fetch servers list
  const { data: serversData, isLoading: serversLoading, error: serversError } = useQuery({
    queryKey: ['servers'],
    queryFn: federationApi.getServers,
    refetchInterval: 60000, // Refetch every minute
  });

  // Fetch AI providers status
  const { data: aiData, isLoading: aiLoading } = useQuery({
    queryKey: ['ai-providers'],
    queryFn: federationApi.getAIProviders,
    refetchInterval: 300000, // Refetch every 5 minutes
  });

  // Fetch sampling health analysis
  const { data: samplingData, isLoading: samplingLoading } = useQuery({
    queryKey: ['sampling-health'],
    queryFn: federationApi.samplingHealthAnalysis,
    refetchInterval: 120000, // Refetch every 2 minutes
    enabled: !!aiData?.providers?.openai || !!aiData?.providers?.ollama, // Only if AI is available
  });

  if (healthLoading || serversLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (healthError || serversError) {
    return (
      <div className="bg-red-900 border border-red-700 rounded-lg p-4">
        <div className="flex items-center">
          <XCircle className="h-5 w-5 text-red-400 mr-2" />
          <h3 className="text-lg font-medium text-red-400">Connection Error</h3>
        </div>
        <p className="mt-2 text-red-300">
          Unable to connect to the Federation Bridge. Please check if the service is running.
        </p>
      </div>
    );
  }

  const health = healthData?.data || {};
  const servers = serversData?.data?.servers || [];

  // Calculate server stats
  const totalServers = servers.length;
  const healthyServers = health.server_health?.filter((s: any) => s.status === 'healthy').length || 0;
  const unhealthyServers = totalServers - healthyServers;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">MCP Federation Dashboard</h1>
        <p className="text-gray-400 mt-2">
          Unified control center for your MCP server ecosystem
        </p>
      </div>

      {/* Health Summary */}
      <HealthSummary
        totalServers={totalServers}
        healthyServers={healthyServers}
        unhealthyServers={unhealthyServers}
        federationStatus={health.federation_status}
      />

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center">
            <Server className="h-8 w-8 text-blue-500 mr-3" />
            <div>
              <p className="text-2xl font-bold text-white">{totalServers}</p>
              <p className="text-gray-400 text-sm">Total Servers</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center">
            <CheckCircle className="h-8 w-8 text-green-500 mr-3" />
            <div>
              <p className="text-2xl font-bold text-white">{healthyServers}</p>
              <p className="text-gray-400 text-sm">Healthy Servers</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center">
            <AlertTriangle className={`h-8 w-8 mr-3 ${
              unhealthyServers > 0 ? 'text-yellow-500' : 'text-gray-500'
            }`} />
            <div>
              <p className="text-2xl font-bold text-white">{unhealthyServers}</p>
              <p className="text-gray-400 text-sm">Issues</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center">
            <Activity className="h-8 w-8 text-purple-500 mr-3" />
            <div>
              <p className="text-2xl font-bold text-white">
                {health.federation_status === 'healthy' ? 'Online' : 'Degraded'}
              </p>
              <p className="text-gray-400 text-sm">Federation Status</p>
            </div>
          </div>
        </div>

        {/* AI Status */}
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center">
            <Brain className={`h-8 w-8 mr-3 ${
              aiData?.providers?.openai || aiData?.providers?.ollama ? 'text-purple-500' : 'text-gray-500'
            }`} />
            <div>
              <p className="text-2xl font-bold text-white">
                {aiData?.providers?.openai || aiData?.providers?.ollama ? 'Active' : 'Offline'}
              </p>
              <p className="text-gray-400 text-sm">AI Services</p>
            </div>
          </div>
          <div className="flex space-x-2 mt-3">
            {aiData?.providers?.openai && (
              <span className="px-2 py-1 text-xs bg-green-600 text-white rounded">OpenAI</span>
            )}
            {aiData?.providers?.ollama && (
              <span className="px-2 py-1 text-xs bg-blue-600 text-white rounded">Ollama</span>
            )}
            {!aiData?.providers?.openai && !aiData?.providers?.ollama && (
              <span className="px-2 py-1 text-xs bg-gray-600 text-gray-300 rounded">No AI</span>
            )}
          </div>
        </div>

        {/* Sampling Status */}
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center">
            <Zap className={`h-8 w-8 mr-3 ${
              samplingData ? 'text-yellow-500' : 'text-gray-500'
            }`} />
            <div>
              <p className="text-2xl font-bold text-white">
                {samplingData ? '2.14.3' : 'Basic'}
              </p>
              <p className="text-gray-400 text-sm">FastMCP Version</p>
            </div>
          </div>
          <div className="mt-3">
            {samplingData ? (
              <span className="px-2 py-1 text-xs bg-purple-600 text-white rounded">Sampling Active</span>
            ) : (
              <span className="px-2 py-1 text-xs bg-gray-600 text-gray-300 rounded">Basic Mode</span>
            )}
          </div>
        </div>
      </div>

      {/* Server Grid */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">Federated Servers</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {servers.map((server: any) => (
            <ServerCard
              key={server.id}
              server={server}
              health={health.server_health?.find((h: any) => h.server_id === server.id)}
            />
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Recent Activity</h2>
        <div className="space-y-3">
          <div className="flex items-center text-gray-300">
            <CheckCircle className="h-4 w-4 text-green-500 mr-3" />
            <span>Federation Bridge initialized with {totalServers} servers</span>
            <span className="ml-auto text-sm text-gray-500">
              {new Date().toLocaleTimeString()}
            </span>
          </div>
          <div className="flex items-center text-gray-300">
            <Activity className="h-4 w-4 text-blue-500 mr-3" />
            <span>Health monitoring active</span>
            <span className="ml-auto text-sm text-gray-500">
              {new Date().toLocaleTimeString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;