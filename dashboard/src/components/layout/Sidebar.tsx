import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Server,
  FolderOpen,
  Heart,
  Camera,
  Zap,
  Thermometer,
  Shield
} from 'lucide-react';

const Sidebar: React.FC = () => {
  const location = useLocation();

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Servers', href: '/servers', icon: Server },
    { name: 'Categories', href: '/categories', icon: FolderOpen },
    { name: 'Health', href: '/health', icon: Heart },
  ];

  const quickAccess = [
    { name: 'Cameras', icon: Camera, category: 'smart-home' },
    { name: 'Energy', icon: Zap, category: 'smart-home' },
    { name: 'Climate', icon: Thermometer, category: 'smart-home' },
    { name: 'Security', icon: Shield, category: 'security' },
  ];

  return (
    <div className="w-64 bg-gray-800 border-r border-gray-700">
      <nav className="mt-8 px-4">
        {/* Main Navigation */}
        <div className="space-y-2">
          <h3 className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Navigation
          </h3>
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                <item.icon className="mr-3 h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </div>

        {/* Quick Access */}
        <div className="mt-8 space-y-2">
          <h3 className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Quick Access
          </h3>
          {quickAccess.map((item) => (
            <button
              key={item.name}
              className="w-full group flex items-center px-3 py-2 text-sm font-medium text-gray-300 rounded-md hover:bg-gray-700 hover:text-white transition-colors"
              onClick={() => {
                // TODO: Navigate to category with filter
                console.log(`Navigate to ${item.category} category`);
              }}
            >
              <item.icon className="mr-3 h-5 w-5" />
              {item.name}
            </button>
          ))}
        </div>

        {/* Federation Status */}
        <div className="mt-8 px-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Federation Status
          </h3>
          <div className="bg-gray-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-300">Bridge</span>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
                <span className="text-xs text-green-400">Online</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Servers</span>
              <span className="text-xs text-gray-400">4/4 Healthy</span>
            </div>
          </div>
        </div>
      </nav>
    </div>
  );
};

export default Sidebar;