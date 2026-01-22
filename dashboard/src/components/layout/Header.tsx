import React from 'react';
import { Activity, Settings } from 'lucide-react';

const Header: React.FC = () => {
  return (
    <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Activity className="h-8 w-8 text-blue-500" />
            <div>
              <h1 className="text-xl font-bold text-white">MCP Federation</h1>
              <p className="text-sm text-gray-400">Unified Smart Home Control</p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-right">
            <div className="text-sm text-gray-400">Federation Status</div>
            <div className="flex items-center text-green-400">
              <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
              Online
            </div>
          </div>
          <button className="p-2 text-gray-400 hover:text-white transition-colors">
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;