import React from 'react';
import { Terminal, ExternalLink } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { bridgePath } from '@/lib/bridgeUrl';

interface HeaderProps {
    isSidebarCollapsed: boolean;
}

const Header: React.FC<HeaderProps> = () => {
    const location = useLocation();

    // Map path → readable title
    const TITLES: Record<string, string> = {
        '/': 'Dashboard',
        '/servers': 'Servers',
        '/peers': 'Peers',
        '/health': 'Health',
        '/portmap': 'Port Map',
        '/tools': 'Tool Explorer',
        '/apps': 'Apps',
        '/missions': 'Config',
        '/categories': 'Categories',
        '/intelligence': 'Local AI',
        '/security': 'Security',
        '/worlds': 'Logs',
    };
    const title = TITLES[location.pathname] ?? 'MCP Federation Hub';

    return (
        <header className="h-14 flex items-center justify-between px-6 bg-white/[0.01] backdrop-blur-2xl border-b border-white/5 z-50 shrink-0">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-[0_0_12px_rgba(56,189,248,0.3)]">
                        <Terminal className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-outfit font-bold text-slate-200 text-sm tracking-tight">MCP Federation Hub</span>
                </div>
                <div className="h-4 w-px bg-white/10" />
                <span className="text-sm text-slate-400">{title}</span>
            </div>

            <div className="flex items-center gap-4">
                {/* Quick links */}
                <a
                    href="http://localhost:10857/redoc"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 text-xs font-bold hover:text-blue-400 hover:border-blue-500/30 transition-all"
                >
                    <ExternalLink size={12} /> API Docs
                </a>
                <a
                    href={bridgePath('/health')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 text-xs font-bold hover:text-emerald-400 hover:border-emerald-500/30 transition-all"
                >
                    <ExternalLink size={12} /> /health
                </a>

                <div className="h-4 w-px bg-white/10" />

                {/* User */}
                <div className="flex items-center gap-2 text-sm">
                    <div className="w-7 h-7 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-xs font-bold text-slate-400">
                        S
                    </div>
                    <span className="text-slate-400 text-xs hidden md:block">Sandra</span>
                </div>
            </div>
        </header>
    );
};

export default Header;
