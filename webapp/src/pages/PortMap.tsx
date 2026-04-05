import React, { useState, useEffect, useCallback } from 'react';
import { Network, RefreshCw, AlertCircle, ExternalLink, Search } from 'lucide-react';
import { federationApi } from '@/services/api';
import { cn } from '@/lib/utils';

interface PortEntry {
    port: string;
    repo: string;
    service: string;
    open: boolean;
    checked_at: string;
}

interface PortMapData {
    ports: PortEntry[];
    total: number;
    open: number;
    closed: number;
}

const PortMap: React.FC = () => {
    const [data, setData] = useState<PortMapData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await federationApi.getPortMap();
            setData(result);
            setLastRefresh(new Date());
        } catch (e: any) {
            setError('Failed to load port map: ' + e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const ports = data?.ports ?? [];

    const filtered = ports.filter(p => {
        const matchSearch = !search ||
            p.port.includes(search) ||
            p.repo.toLowerCase().includes(search.toLowerCase()) ||
            p.service.toLowerCase().includes(search.toLowerCase());
        const matchFilter =
            filter === 'all' ||
            (filter === 'open' && p.open) ||
            (filter === 'closed' && !p.open);
        return matchSearch && matchFilter;
    });

    return (
        <div className="space-y-6 animate-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-outfit font-bold tracking-tight gradient-text">Port Map</h1>
                    <p className="text-slate-400 mt-1">
                        All ports from WEBAPP_PORTS.md, socket-checked live. Click a port to open its web interface.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {lastRefresh && (
                        <span className="text-[10px] text-slate-500 font-mono">
                            {lastRefresh.toLocaleTimeString()}
                        </span>
                    )}
                    <button
                        onClick={load}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm font-bold hover:bg-white/10 transition-all disabled:opacity-50"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                    <AlertCircle size={16} /> {error}
                </div>
            )}

            {/* Summary */}
            {data && (
                <div className="grid grid-cols-3 gap-4">
                    <div className="sota-card p-4">
                        <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Total ports</span>
                        <span className="text-2xl font-bold font-outfit">{data.total}</span>
                    </div>
                    <div className="sota-card p-4 border-emerald-500/10">
                        <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Open (listening)</span>
                        <span className="text-2xl font-bold font-outfit text-emerald-400">{data.open}</span>
                    </div>
                    <div className="sota-card p-4 border-slate-700/40">
                        <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Closed / not running</span>
                        <span className="text-2xl font-bold font-outfit text-slate-500">{data.closed}</span>
                    </div>
                </div>
            )}

            {/* Search + filter */}
            <div className="flex gap-3">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search port, repo, service…"
                        className="w-full h-9 pl-9 pr-4 bg-white/[0.02] border border-white/5 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                    />
                </div>
                {(['all', 'open', 'closed'] as const).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all",
                            filter === f
                                ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                                : "bg-white/[0.02] border-white/5 text-slate-500 hover:text-slate-300"
                        )}
                    >
                        {f}
                        {f === 'open' && data ? ` (${data.open})` : ''}
                        {f === 'closed' && data ? ` (${data.closed})` : ''}
                        {f === 'all' && data ? ` (${data.total})` : ''}
                    </button>
                ))}
            </div>

            {/* Port table */}
            {loading && !data ? (
                <div className="sota-card p-10 text-center text-slate-500 text-sm">
                    Scanning {ports.length || '…'} ports via socket check…
                </div>
            ) : (
                <div className="sota-card overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white/5">
                                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 w-20">Port</th>
                                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">Repo</th>
                                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">Service</th>
                                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 w-24">Status</th>
                                <th className="px-4 py-3 w-16"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.03]">
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-sm">
                                        No ports match your filter.
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((p, i) => (
                                    <tr key={p.port + i} className="hover:bg-white/[0.02] transition-all">
                                        <td className="px-4 py-2.5">
                                            <span className="font-mono font-bold text-slate-200">{p.port}</span>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <span className="text-slate-300 font-medium">{p.repo}</span>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <span className="text-slate-400 text-xs">{p.service}</span>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-2">
                                                <div className={cn(
                                                    "w-2 h-2 rounded-full shrink-0",
                                                    p.open ? "bg-emerald-400" : "bg-slate-600"
                                                )} />
                                                <span className={cn(
                                                    "text-[10px] font-bold uppercase",
                                                    p.open ? "text-emerald-400" : "text-slate-600"
                                                )}>
                                                    {p.open ? 'Open' : 'Closed'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5 text-right">
                                            {p.open && (
                                                <a
                                                    href={`http://localhost:${p.port}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-500/10 text-blue-400 text-[10px] font-bold hover:bg-blue-500/20 transition-all"
                                                >
                                                    <ExternalLink size={10} /> Open
                                                </a>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default PortMap;
