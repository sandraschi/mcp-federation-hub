import React from 'react';
import { CheckCircle, AlertTriangle, XCircle, Activity } from 'lucide-react';

interface HealthSummaryProps {
  totalServers: number;
  healthyServers: number;
  unhealthyServers: number;
  federationStatus: string;
}

const HealthSummary: React.FC<HealthSummaryProps> = ({
  totalServers,
  healthyServers,
  unhealthyServers,
  federationStatus
}) => {
  const getFederationStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-400 bg-green-400/10 border-green-400/20';
      case 'degraded':
        return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
      default:
        return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
    }
  };

  const getFederationStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5" />;
      case 'degraded':
        return <AlertTriangle className="h-5 w-5" />;
      default:
        return <XCircle className="h-5 w-5" />;
    }
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">Federation Health</h2>
        <div className={`flex items-center space-x-2 px-3 py-1 rounded-full border ${getFederationStatusColor(federationStatus)}`}>
          {getFederationStatusIcon(federationStatus)}
          <span className="text-sm font-medium capitalize">{federationStatus}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total Servers */}
        <div className="bg-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-white">{totalServers}</p>
              <p className="text-sm text-gray-400">Total Servers</p>
            </div>
            <Activity className="h-8 w-8 text-blue-500" />
          </div>
        </div>

        {/* Healthy Servers */}
        <div className="bg-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-green-400">{healthyServers}</p>
              <p className="text-sm text-gray-400">Healthy</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-500" />
          </div>
        </div>

        {/* Unhealthy Servers */}
        <div className={`bg-gray-700 rounded-lg p-4 ${unhealthyServers > 0 ? 'border border-yellow-500/50' : ''}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-2xl font-bold ${unhealthyServers > 0 ? 'text-yellow-400' : 'text-gray-400'}`}>
                {unhealthyServers}
              </p>
              <p className="text-sm text-gray-400">Issues</p>
            </div>
            {unhealthyServers > 0 ? (
              <AlertTriangle className="h-8 w-8 text-yellow-500" />
            ) : (
              <CheckCircle className="h-8 w-8 text-gray-500" />
            )}
          </div>
        </div>

        {/* Health Percentage */}
        <div className="bg-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-white">
                {totalServers > 0 ? Math.round((healthyServers / totalServers) * 100) : 0}%
              </p>
              <p className="text-sm text-gray-400">Uptime</p>
            </div>
            <div className="w-8 h-8 relative">
              <svg className="w-8 h-8 transform -rotate-90" viewBox="0 0 32 32">
                <circle
                  cx="16"
                  cy="16"
                  r="14"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                  className="text-gray-600"
                />
                <circle
                  cx="16"
                  cy="16"
                  r="14"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 14}`}
                  strokeDashoffset={`${2 * Math.PI * 14 * (1 - (healthyServers / Math.max(totalServers, 1)))}`}
                  className="text-green-500 transition-all duration-300"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Health Details */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Federation Status</h3>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${
              federationStatus === 'healthy' ? 'bg-green-400' :
              federationStatus === 'degraded' ? 'bg-yellow-400' : 'bg-red-400'
            }`}></div>
            <span className="text-white capitalize">{federationStatus}</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Last updated: {new Date().toLocaleTimeString()}
          </p>
        </div>

        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Active Categories</h3>
          <div className="flex flex-wrap gap-1">
            <span className="px-2 py-1 text-xs bg-blue-600 text-white rounded">Smart Home</span>
            <span className="px-2 py-1 text-xs bg-red-600 text-white rounded">Security</span>
            <span className="px-2 py-1 text-xs bg-green-600 text-white rounded">Weather</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HealthSummary;