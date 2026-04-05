import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Rocket, ExternalLink, Search, Play, Square,
    RefreshCw, AlertCircle, Globe, Activity, Layout
} from 'lucide-react';
import { federationApi } from '@/services/api';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';

interface WebApp {
    id: string;
    name: string;
    repo_path?: string;
    frontend_port?: number;
    backend_port?: number;
    category?: string;
    status?: string;
    description?: string;
    start_command?: string;
}

const Apps: React.FC = () => {
    const [apps, setApps] = useState<WebApp[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [launching, setLaunching] = useState<string | null>(null);
    const [stopping, setStopping] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await federationApi.getServers();
            // Build app list from registered servers that have web_interface
            const appList: WebApp[] = (data.servers || [])
                .filter((s: any) => s.web_interface || s.mcp_endpoint)
                .map((s: any) => ({
                    id: s.id,
                    name: s.name || s.id,
                    category: s.category,
                    description: s.description,
                    status: s.status,
                    frontend_port: (() => {
                        try { return s.web_interface ? parseInt(new URL(s.web_interface).port) || undefined : undefined; } catch { return undefined; }
                    })(),
                }));
            setApps(appList);
        } catch (e: any) {
            setError('Could not load from bridge: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleLaunch = async (app: WebApp) => {
        setLaunching(app.id);
        try {
            await federationApi.startServer(app.id);
            toast.success(`Started ${app.name}`);
        } catch (e: any) {
            const msg = e.response?.data?.detail || e.message || 'Start failed';
            toast.error(`${app.name}: ${msg}`);
        } finally {
            setLaunching(null);
        }
    };

    const handleStop = async (app: WebApp) => {
        if (!app.frontend_port) {
            toast.error('No port known for ' + app.name);
            return;
        }
        setStopping(app.id);
        try {
            await federationApi.stopServer(app.id);
            toast.success(`Stopped ${app.name}`);
        } catch (e: any) {
            const msg = e.response?.data?.detail || e.message || 'Stop failed';
            toast.error(`${app.name}: ${msg}`);
        } finally {
            setStopping(null);
        }
    };

    const filtered = apps.filter(a =>
        !search ||
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.category?.toLowerCase().includes(search.toLowerCase()) ||
        a.id.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-8 animate-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-outfit font-bold tracking-tight gradient-text">Apps</h1>
                    <p className="text-slate-400 mt-1">Launch or stop registered MCP server webapps. Uses the bridge start/stop API.</p>
                </div>
                <div className="flex gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Filter…"
                            className="w-48 h-9 pl-9 pr-3 bg-white/[0.02] border border-white/5 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                        />
                    </div>
                    <button
                        onClick={load}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm font-bold hover:bg-white/10 transition-all disabled:opacity-50"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Reload
                    </button>
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                    <AlertCircle size={16} /> {error}
                </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <div className="sota-card p-4 flex items-center gap-3">
                    <Layout size={16} className="text-blue-400" />
                    <div>
                        <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">Registered</span>
                        <span className="text-xl font-bold">{apps.length}</span>
                    </div>
                </div>
                <div className="sota-card p-4 flex items-center gap-3">
                    <Activity size={16} className="text-emerald-400" />
                    <div>
                        <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">Shown</span>
                        <span className="text-xl font-bold">{filtered.length}</span>
                    </div>
                </div>
                <div className="sota-card p-4 flex items-center gap-3">
                    <Rocket size={16} className="text-amber-400" />
                    <div>
                        <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">Start via</span>
                        <span className="text-xl font-bold font-mono text-xs text-slate-300">start.bat</span>
                    </div>
                </div>
            </div>

            {/* App grid */}
            {loading ? (
                <div className="sota-card p-10 text-center text-slate-500 text-sm">Loading from bridge…</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filtered.map(app => (
                        <motion.div
                            key={app.id}
                            layout
                            initial={{ opacity: 0, scale: 0.97 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="sota-card p-5 flex flex-col gap-3"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-slate-100 truncate">{app.name}</h3>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[10px] text-slate-500 font-mono">{app.id}</span>
                                        {app.category && (
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 uppercase">{app.category}</span>
                                        )}
                                    </div>
                                    {app.description && (
                                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{app.description}</p>
                                    )}
                                </div>
                                {app.frontend_port && (
                                    <a
                                        href={`http://localhost:${app.frontend_port}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
                                        title={`Open :${app.frontend_port}`}
                                    >
                                        <ExternalLink size={14} />
                                    </a>
                                )}
                            </div>

                            {app.frontend_port && (
                                <div className="text-[10px] text-slate-600 font-mono">
                                    port {app.frontend_port}
                                </div>
                            )}

                            <div className="flex gap-2 mt-auto pt-2 border-t border-white/5">
                                <button
                                    onClick={() => handleLaunch(app)}
                                    disabled={launching === app.id}
                                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-500/10 text-blue-400 text-xs font-bold hover:bg-blue-500/20 transition-all disabled:opacity-50"
                                >
                                    {launching === app.id
                                        ? <RefreshCw size={12} className="animate-spin" />
                                        : <Play size={12} fill="currentColor" />
                                    }
                                    Start
                                </button>
                                <button
                                    onClick={() => handleStop(app)}
                                    disabled={stopping === app.id || !app.frontend_port}
                                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-rose-500/10 text-rose-400 text-xs font-bold hover:bg-rose-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    title={!app.frontend_port ? 'No port configured — cannot stop by port' : undefined}
                                >
                                    {stopping === app.id
                                        ? <RefreshCw size={12} className="animate-spin" />
                                        : <Square size={12} fill="currentColor" />
                                    }
                                    Stop
                                </button>
                            </div>
                        </motion.div>
                    ))}
                    {filtered.length === 0 && (
                        <div className="col-span-3 sota-card p-10 text-center text-slate-500 text-sm">
                            No apps match your filter, or no servers have web interfaces registered in federation-config.json.
                        </div>
                    )}
                </div>
            )}

            <p className="text-xs text-slate-600">
                Start runs the server's <code>start.bat</code> / <code>start.ps1</code> in a new console window.
                Stop kills all processes listening on the server's configured port.
                Federation config must include <code>web_interface</code> or <code>mcp_endpoint</code> for a server to appear here.
            </p>
        </div>
    );
};

export default Apps;
