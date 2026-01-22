import React from 'react';
import { CheckCircle, XCircle, AlertTriangle, ExternalLink, Zap, Camera, Shield } from 'lucide-react';

interface ServerCardProps {
  server: {
    id: string;
    name: string;
    description: string;
    category: string;
    capabilities: string[];
    tools: string[];
    web_interface?: string;
  };
  health?: {
    status: string;
    response_time?: number;
    error?: string;
  };
}

const ServerCard: React.FC<ServerCardProps> = ({ server, health }) => {
  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-400 bg-green-400/10 border-green-400/20';
      case 'unhealthy':
        return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
      case 'unreachable':
        return 'text-red-400 bg-red-400/10 border-red-400/20';
      default:
        return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-4 w-4" />;
      case 'unhealthy':
        return <AlertTriangle className="h-4 w-4" />;
      case 'unreachable':
        return <XCircle className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'smart-home':
        return <Zap className="h-5 w-5 text-blue-500" />;
      case 'security':
        return <Shield className="h-5 w-5 text-red-500" />;
      case 'weather':
        return <Camera className="h-5 w-5 text-green-500" />;
      default:
        return <Zap className="h-5 w-5 text-gray-500" />;
    }
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 hover:border-gray-600 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          {getCategoryIcon(server.category)}
          <div>
            <h3 className="text-lg font-semibold text-white">{server.name}</h3>
            <p className="text-sm text-gray-400 capitalize">{server.category.replace('-', ' ')}</p>
          </div>
        </div>
        {server.web_interface && (
          <a
            href={server.web_interface}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-white transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>

      {/* Description */}
      <p className="text-gray-300 text-sm mb-4">{server.description}</p>

      {/* Capabilities */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-400 mb-2">Capabilities</h4>
        <div className="flex flex-wrap gap-1">
          {server.capabilities.slice(0, 3).map((capability) => (
            <span
              key={capability}
              className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded-md"
            >
              {capability.replace('-', ' ')}
            </span>
          ))}
          {server.capabilities.length > 3 && (
            <span className="px-2 py-1 text-xs bg-gray-700 text-gray-500 rounded-md">
              +{server.capabilities.length - 3} more
            </span>
          )}
        </div>
      </div>

      {/* Tools Count */}
      <div className="mb-4">
        <span className="text-sm text-gray-400">
          {server.tools.length} tools available
        </span>
      </div>

      {/* Health Status */}
      <div className="flex items-center justify-between">
        <div className={`flex items-center space-x-2 px-3 py-1 rounded-full border ${getStatusColor(health?.status)}`}>
          {getStatusIcon(health?.status)}
          <span className="text-sm font-medium capitalize">
            {health?.status || 'unknown'}
          </span>
        </div>

        {health?.response_time && (
          <span className="text-xs text-gray-400">
            {Math.round(health.response_time)}ms
          </span>
        )}
      </div>

      {/* Error Message */}
      {health?.error && (
        <div className="mt-3 p-2 bg-red-900/50 border border-red-700/50 rounded text-xs text-red-300">
          {health.error}
        </div>
      )}
    </div>
  );
};

export default ServerCard;