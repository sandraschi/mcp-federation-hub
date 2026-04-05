import React, { useEffect, useState, useCallback } from 'react';
import {
    Heart, Activity, RefreshCw, AlertCircle, CheckCircle2,
    Clock, Server, XCircle, HelpCircle
} from 'lucide-react';
import { federationApi } from '@/services/api';
import { cn } from '@/lib/utils';

interface UptimeEntry {
    uptime_pct: number | null;
    total_checks: number;
    healthy_checks: number;
    last_status: string;
    last_check: string | null;
    last_response_ms: number | null;
}

interface HistoryCheck {
    timestamp: string;
    status: string;
    response_time: number | null;
    error?: string;
}

function StatusDot({ status }: { status: string }) {
    if (status === 'healthy') return <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />;
    if (status === 'unhealthy') return <div className="w-2 h-2 rounded-full bg-amber-400" />;
    if (status === 'unreachable' || status === 'error') return <div className="w-2 h-2 rounded-full bg-rose-500" />;
    return <div className="w-2 h-2 rounded-full bg-slate-600" />;
}

function UptimeBar({ checks }: { checks: HistoryCheck[] }) {
    // Show last 60 checks as mini bars
    const visible = checks.slice(0, 60).reverse();
    return (
        <div className="flex gap-px items-end h-6 mt-1">
            {visible.map((c, i) => (
                <div
                    key={i}
                    title={`${c.status} @ ${new Date(c.timestamp).toLocaleTimeString()} — ${c.response_time ? c.response_time + 'ms' : 'n/a'}`}
                    className={cn(
                        "flex-1 rounded-sm min-w-[3px] transition-all",
                        c.status === 'healthy' ? 'bg-emerald-500 h-full' :
                        c.status === 'unhealthy' ? 'bg-amber-400 h-3/4' :
                        c.status === 'unreachable' ? 'bg-rose-500 h-1/2' :
                        'bg-slate-700 h-1/4'
                    )}
                />
            ))}
            {/* Fill remaining if fewer than 60 checks */}
            {Array.from({ length: Math.max(0, 60 - visible.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="flex-1 rounded-sm min-w-[3px] bg-white/5 h-1/4" />
            ))}
        </div>
    );
}

const Health: React.FC = () => {
    const [uptime, setUptime] = useState<Record<string, UptimeEntry>>({});
    const [history, setHistory] = useState<Record<string, HistoryCheck[]>>({});
    const [servers, setServers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            const [uptimeData, histData, serverData] = await Promise.all([
                federationApi.getUptimeSummary(),
                federationApi.getHealthHistory(),
                federationApi.getServers(),
            ]);
            setUptime(uptimeData);
            setHistory(histData);
            setServers(serverData.servers || []);
            setLastRefresh(new Date());
        } catch (e: any) {
            setError('Bridge unreachable — ' + e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const id = setInterval(load, 30000);
        return () => clearInterval(id);
    }, [load]);

    const serverList = servers.length > 0 ? servers : Object.keys(uptime).map(id => ({ id, name: id }));
    const totalHealthy = Object.values(uptime).filter(u => u.last_status === 'healthy').length;
    const totalChecked = Object.keys(uptime).length;

    return (
        <div className="space-y-8 animate-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-outfit font-bold tracking-tight gradient-text">Health</h1>
                    <p className="text-slate-400 mt-1">
                        Live fleet status — polled every 30s. Bars show last {60} checks (~{Math.round(60 * 30 / 60)}min).
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {lastRefresh && (
                        <span className="text-[10px] text-slate-500 font-mono">
                            last: {lastRefresh.toLocaleTimeString()}
                        </span>
                    )}
                    <button
                        onClick={load}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm font-bold hover:bg-white/10 transition-all disabled:opacity-50"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
                    </button>
                    <div className={cn(
                        "flex items-center gap-2 px-4 py-2 sota-card",
                        totalHealthy === totalChecked && totalChecked > 0 ? "border-emerald-500/20" : "border-amber-500/20"
                    )}>
                        <Heart size={16} className={totalHealthy === totalChecked && totalChecked > 0 ? "text-emerald-400" : "text-amber-400"} />
                        <span className="text-sm font-bold">
                            {loading ? '…' : `${totalHealthy} / ${totalChecked} up`}
                        </span>
                    </div>
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                    <AlertCircle size={16} /> {error}
                    <span className="text-slate-400 text-xs ml-2">
                        Bridge not running? Start it first.
                    </span>
                </div>
            )}

            {/* Summary stats */}
            {!loading && totalChecked > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { label: 'Healthy now', val: totalHealthy, color: 'text-emerald-400' },
                        { label: 'Unhealthy / unreachable', val: totalChecked - totalHealthy, color: 'text-rose-400' },
                        { label: 'Total registered', val: servers.length || totalChecked, color: 'text-blue-400' },
                        {
                            label: 'Avg uptime (history)',
                            val: (() => {
                                const pcts = Object.values(uptime).map(u => u.uptime_pct).filter(p => p !== null) as number[];
                                return pcts.length ? (pcts.reduce((a, b) => a + b, 0) / pcts.length).toFixed(1) + '%' : '—';
                            })(),
                            color: 'text-indigo-400'
                        },
                    ].map((s, i) => (
                        <div key={i} className="sota-card p-4">
                            <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">{s.label}</span>
                            <span className={cn("text-2xl font-bold font-outfit", s.color)}>{s.val}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Server list */}
            {loading && totalChecked === 0 ? (
                <div className="sota-card p-10 text-center text-slate-500 text-sm">
                    Waiting for first health poll ({30}s interval)… Bridge must be running.
                </div>
            ) : (
                <div className="sota-card divide-y divide-white/5">
                    {serverList.map((srv) => {
                        const up = uptime[srv.id];
                        const hist = history[srv.id] || [];
                        const lastStatus = up?.last_status ?? 'unknown';
                        return (
                            <div key={srv.id} className="p-4 hover:bg-white/[0.015] transition-all">
                                <div className="flex items-center gap-4">
                                    <StatusDot status={lastStatus} />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <span className="font-bold text-slate-100 text-sm">{srv.name || srv.id}</span>
                                            <span className="text-[10px] text-slate-500 font-mono">{srv.id}</span>
                                            {srv.category && (
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/5 text-slate-500 uppercase">{srv.category}</span>
                                            )}
                                        </div>

                                        {up ? (
                                            <>
                                                <UptimeBar checks={hist} />
                                                <div className="flex items-center gap-4 mt-1 text-[10px] text-slate-500">
                                                    <span className={cn("font-bold uppercase",
                                                        lastStatus === 'healthy' ? 'text-emerald-400' :
                                                        lastStatus === 'unreachable' ? 'text-rose-400' :
                                                        'text-amber-400'
                                                    )}>{lastStatus}</span>
                                                    <span>uptime {up.uptime_pct !== null ? up.uptime_pct + '%' : '—'}</span>
                                                    <span>{up.total_checks} checks</span>
                                                    {up.last_response_ms && <span>{up.last_response_ms}ms</span>}
                                                    {up.last_check && <span>{new Date(up.last_check).toLocaleTimeString()}</span>}
                                                </div>
                                            </>
                                        ) : (
                                            <div className="text-[10px] text-slate-600 mt-1">Not yet polled — bridge must be running</div>
                                        )}
                                    </div>

                                    {/* Web interface link */}
                                    {srv.web_interface && (
                                        <a
                                            href={srv.web_interface}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="shrink-0 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 text-[10px] font-bold hover:bg-blue-500/20 transition-all"
                                        >
                                            Open UI
                                        </a>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default Health;
