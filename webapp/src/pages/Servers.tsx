import React, { useState, useEffect, useCallback } from 'react';
import {
    Server, Globe, Activity, RefreshCw, ExternalLink,
    AlertCircle, Search, Play, Square, Link2
} from 'lucide-react';
import { federationApi } from '@/services/api';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface ServerEntry {
    id: string;
    name: string;
    description?: string;
    category?: string;
    tier?: string;
    mcp_endpoint?: string;
    health_endpoint?: string;
    web_interface?: string;
    status?: string;
    type?: string;
}

interface HealthResult {
    server_id: string;
    status: string;
    response_time?: number;
    error?: string;
}

const TIERS: Record<string, { label: string; color: string }> = {
    gold: { label: 'gold', color: 'text-amber-400' },
    peer: { label: 'peer', color: 'text-indigo-400' },
    utility: { label: 'utility', color: 'text-slate-400' },
    creative: { label: 'creative', color: 'text-violet-400' },
};

const Servers: React.FC = () => {
    const [servers, setServers] = useState<ServerEntry[]>([]);
    const [health, setHealth] = useState<Record<string, HealthResult>>({});
    const [loading, setLoading] = useState(true);
    const [checkingAll, setCheckingAll] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [launching, setLaunching] = useState<string | null>(null);
    const [stopping, setStopping] = useState<string | null>(null);

    const loadServers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await federationApi.getServers();
            setServers(data.servers || []);
        } catch (e: any) {
            setError('Bridge unreachable: ' + e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    const checkAllHealth = useCallback(async () => {
        setCheckingAll(true);
        try {
            const data = await federationApi.getHealth();
            const map: Record<string, HealthResult> = {};
            for (const h of data.server_health || []) map[h.server_id] = h;
            setHealth(map);
        } catch (e: any) {
            toast.error('Health check failed: ' + e.message);
        } finally {
            setCheckingAll(false);
        }
    }, []);

    useEffect(() => {
        loadServers().then(checkAllHealth);
    }, []);

    const handleStart = async (srv: ServerEntry) => {
        setLaunching(srv.id);
        try {
            await federationApi.startServer(srv.id);
            toast.success(`Started ${srv.name || srv.id}`);
        } catch (e: any) {
            toast.error(`Start failed: ${e.response?.data?.detail ?? e.message}`);
        } finally {
            setLaunching(null);
        }
    };

    const handleStop = async (srv: ServerEntry) => {
        setStopping(srv.id);
        try {
            await federationApi.stopServer(srv.id);
            toast.success(`Stopped ${srv.name || srv.id}`);
        } catch (e: any) {
            toast.error(`Stop failed: ${e.response?.data?.detail ?? e.message}`);
        } finally {
            setStopping(null);
        }
    };

    const filtered = servers.filter(s =>
        !search ||
        s.name?.toLowerCase().includes(search.toLowerCase()) ||
        s.id.toLowerCase().includes(search.toLowerCase()) ||
        s.category?.toLowerCase().includes(search.toLowerCase())
    );

    const healthyCount = Object.values(health).filter(h => h.status === 'healthy').length;
    const checkedCount = Object.keys(health).length;

    return (
        <div className="space-y-6 animate-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-outfit font-bold tracking-tight gradient-text">Servers</h1>
                    <p className="text-slate-400 mt-1">
                        Start looks for <code className="text-blue-400">start.bat</code> or{' '}
                        <code className="text-blue-400">start.ps1</code> in the repo root, then{' '}
                        <code className="text-slate-500">webapp</code>,{' '}
                        <code className="text-slate-500">web_sota</code>,{' '}
                        <code className="text-slate-500">web</code>, or <code className="text-slate-500">scripts</code>.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Filter…"
                            className="w-44 h-9 pl-9 pr-3 bg-white/[0.02] border border-white/5 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                        />
                    </div>
                    <button
                        onClick={() => loadServers().then(checkAllHealth)}
                        disabled={loading || checkingAll}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm font-bold hover:bg-white/10 transition-all disabled:opacity-50"
                    >
                        <RefreshCw size={14} className={loading || checkingAll ? 'animate-spin' : ''} />
                        Refresh + Check Health
                    </button>
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                    <AlertCircle size={16} /> {error}
                </div>
            )}

            {/* Summary row */}
            {!loading && (
                <div className="grid grid-cols-3 gap-4">
                    <div className="sota-card p-4">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Total</span>
                        <span className="text-2xl font-bold font-outfit">{servers.length}</span>
                    </div>
                    <div className="sota-card p-4 border-emerald-500/10">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Healthy</span>
                        <span className="text-2xl font-bold font-outfit text-emerald-400">
                            {checkedCount > 0 ? healthyCount : '—'}
                        </span>
                    </div>
                    <div className="sota-card p-4 border-rose-500/10">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Unreachable</span>
                        <span className="text-2xl font-bold font-outfit text-rose-400">
                            {checkedCount > 0 ? checkedCount - healthyCount : '—'}
                        </span>
                    </div>
                </div>
            )}

            {/* Server table */}
            {loading ? (
                <div className="sota-card p-10 text-center text-slate-500 text-sm">Loading from bridge…</div>
            ) : filtered.length === 0 ? (
                <div className="sota-card p-10 text-center text-slate-500 text-sm">No servers match your filter.</div>
            ) : (
                <div className="sota-card overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white/5">
                                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 w-6"></th>
                                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">Name</th>
                                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 hidden md:table-cell">Category</th>
                                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 hidden lg:table-cell">Tier</th>
                                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 hidden lg:table-cell">Latency</th>
                                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.03]">
                            {filtered.map(srv => {
                                const h = health[srv.id];
                                const statusColor = !h ? 'bg-slate-600'
                                    : h.status === 'healthy' ? 'bg-emerald-400'
                                    : h.status === 'unhealthy' ? 'bg-amber-400'
                                    : 'bg-rose-500';
                                const tierInfo = srv.tier ? TIERS[srv.tier] : null;

                                return (
                                    <tr key={srv.id} className="hover:bg-white/[0.02] transition-all group">
                                        <td className="px-4 py-3">
                                            <div
                                                className={cn('w-2 h-2 rounded-full', statusColor)}
                                                title={h ? `${h.status}${h.response_time ? ` — ${h.response_time}ms` : ''}` : 'Not checked'}
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-slate-100">{srv.name || srv.id}</div>
                                            <div className="text-[10px] text-slate-500 font-mono">{srv.id}</div>
                                        </td>
                                        <td className="px-4 py-3 hidden md:table-cell">
                                            {srv.category && (
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 uppercase">{srv.category}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 hidden lg:table-cell">
                                            {tierInfo ? (
                                                <span className={cn('text-[10px] font-bold uppercase', tierInfo.color)}>{tierInfo.label}</span>
                                            ) : (
                                                <span className="text-[10px] text-slate-600">{srv.tier ?? '—'}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 hidden lg:table-cell font-mono text-[11px] text-slate-500">
                                            {h?.response_time ? `${h.response_time}ms` : '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-end gap-2">
                                                {srv.web_interface && (
                                                    <a
                                                        href={srv.web_interface}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
                                                        title="Open web interface"
                                                    >
                                                        <ExternalLink size={13} />
                                                    </a>
                                                )}
                                                <button
                                                    onClick={() => handleStart(srv)}
                                                    disabled={launching === srv.id}
                                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 text-[10px] font-bold hover:bg-blue-500/20 transition-all disabled:opacity-40"
                                                    title="Start (runs start.bat)"
                                                >
                                                    {launching === srv.id
                                                        ? <RefreshCw size={11} className="animate-spin" />
                                                        : <Play size={11} fill="currentColor" />}
                                                    Start
                                                </button>
                                                <button
                                                    onClick={() => handleStop(srv)}
                                                    disabled={stopping === srv.id}
                                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 text-[10px] font-bold hover:bg-rose-500/20 transition-all disabled:opacity-40"
                                                    title="Stop (kills listening port)"
                                                >
                                                    {stopping === srv.id
                                                        ? <RefreshCw size={11} className="animate-spin" />
                                                        : <Square size={11} fill="currentColor" />}
                                                    Stop
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default Servers;
