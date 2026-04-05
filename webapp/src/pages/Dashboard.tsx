import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
    Activity, Server, Heart, Terminal, Zap,
    RefreshCw, ExternalLink, AlertCircle, CheckCircle2, XCircle
} from 'lucide-react';
import { federationApi } from '@/services/api';
import { bridgePath } from '@/lib/bridgeUrl';
import { cn } from '@/lib/utils';

interface BridgeHealth {
    status: string;
    federation: { servers: number; categories: number };
}

interface ServerHealth {
    server_id: string;
    status: string;
    response_time?: number;
    error?: string;
}

interface FedHealth {
    federation_status: string;
    total_servers: number;
    healthy_servers: number;
    /** Reachable web UI returned non-200 after probing common paths */
    unhealthy_http_servers?: number;
    /** Connection errors to catalog web_interface / health URLs */
    unreachable_servers?: number;
    /** No web_interface or health_endpoint in config */
    unknown_servers?: number;
    /** Backward compat: unreachable + HTTP errors (excludes unknown) */
    unhealthy_servers: number;
    status_counts?: Record<string, number>;
    server_health: ServerHealth[];
}

const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };

const Dashboard: React.FC = () => {
    const [bridgeHealth, setBridgeHealth] = useState<BridgeHealth | null>(null);
    const [fedHealth, setFedHealth] = useState<FedHealth | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            // Bridge basic health (fast)
            const bh = await fetch(bridgePath('/health'), { signal: AbortSignal.timeout(4000) });
            if (bh.ok) setBridgeHealth(await bh.json());

            // Federation health (polls all servers — may be slower)
            const fh = await federationApi.getHealth();
            setFedHealth(fh);
            setLastRefresh(new Date());
        } catch (e: any) {
            setError('Bridge unreachable — start bridge first');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const id = setInterval(load, 30000);
        return () => clearInterval(id);
    }, [load]);

    const isUp = !error && bridgeHealth?.status === 'healthy';
    const healthyCount = fedHealth?.healthy_servers ?? null;
    const totalCount = fedHealth?.total_servers ?? bridgeHealth?.federation?.servers ?? null;
    const unreachableCount =
        fedHealth?.unreachable_servers ?? fedHealth?.status_counts?.unreachable ?? null;
    const unknownCount = fedHealth?.unknown_servers ?? fedHealth?.status_counts?.unknown ?? null;
    const notRunningCount = fedHealth?.unhealthy_servers ?? null;

    // Show worst 5 servers for quick triage
    const problemServers = (fedHealth?.server_health ?? [])
        .filter(s => s.status !== 'healthy')
        .slice(0, 5);

    const healthyServers = (fedHealth?.server_health ?? [])
        .filter(s => s.status === 'healthy')
        .slice(0, 6);

    return (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">

            {/* Header */}
            <motion.div variants={item} className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h1 className="text-5xl font-outfit font-bold tracking-tight gradient-text mb-2">Dashboard</h1>
                    <p className="text-slate-400 font-medium max-w-xl">
                        Federation overview — probes each server&apos;s{' '}
                        <code className="text-slate-500 text-xs">web_interface</code> ( /health, /api/health, /
                        ). Expect most entries to be off until you start those webapps.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {lastRefresh && (
                        <span className="text-[10px] text-slate-500 font-mono">{lastRefresh.toLocaleTimeString()}</span>
                    )}
                    <button
                        onClick={load}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm font-bold hover:bg-white/10 transition-all disabled:opacity-50"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
                    </button>
                    <div className={cn(
                        "flex items-center gap-3 px-4 py-2 sota-card",
                        isUp ? "border-emerald-500/20" : "border-rose-500/20"
                    )}>
                        <Activity size={16} className={isUp ? "text-emerald-400 animate-pulse" : "text-rose-400"} />
                        <span className={cn("text-sm font-bold", isUp ? "text-emerald-400" : "text-rose-400")}>
                            {loading ? '…' : isUp ? 'Bridge up' : 'Bridge down'}
                        </span>
                    </div>
                </div>
            </motion.div>

            {error && (
                <motion.div
                    variants={item}
                    className="flex flex-col gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm"
                >
                    <div className="flex items-start gap-3 text-rose-400">
                        <AlertCircle size={16} className="shrink-0 mt-0.5" />
                        <div>
                            <p className="font-medium">{error}</p>
                            <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                                In dev, this UI proxies <code className="text-slate-300">/health</code> and{' '}
                                <code className="text-slate-300">/api/*</code> to the bridge on{' '}
                                <strong className="text-slate-300">127.0.0.1:10857</strong>. Start the FastAPI app from the{' '}
                                <code className="text-slate-300">bridge</code> folder (repo root = mcp-federation-hub).
                            </p>
                        </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-3 text-xs">
                        <div className="rounded-lg bg-black/30 p-3 border border-white/5">
                            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
                                Easiest (Windows)
                            </div>
                            <code className="block font-mono text-[11px] text-slate-300 whitespace-pre-wrap">
                                {`# From repo root — starts bridge + dashboard\n.\\webapp\\start.ps1`}
                            </code>
                        </div>
                        <div className="rounded-lg bg-black/30 p-3 border border-white/5">
                            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
                                PowerShell (bridge only)
                            </div>
                            <code className="block font-mono text-[11px] text-slate-300 whitespace-pre-wrap">
                                {`Set-Location .\\bridge\nuv run uvicorn app.main:app --host 127.0.0.1 --port 10857`}
                            </code>
                        </div>
                        <div className="rounded-lg bg-black/30 p-3 border border-white/5 md:col-span-2">
                            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
                                bash / zsh
                            </div>
                            <code className="block font-mono text-[11px] text-slate-300 whitespace-pre-wrap">
                                cd bridge &amp;&amp; uv run uvicorn app.main:app --host 127.0.0.1 --port 10857
                            </code>
                        </div>
                    </div>
                    <p className="text-[10px] text-slate-500">
                        Or <code className="text-blue-400">bridge\\start.ps1</code> / <code className="text-blue-400">bridge\\start.bat</code>.
                    </p>
                </motion.div>
            )}

            {/* Stats */}
            <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5">
                {[
                    {
                        label: 'Registered Servers',
                        val: loading ? '…' : (totalCount ?? '—'),
                        sub: 'in federation-config.json',
                        color: 'text-blue-400',
                        icon: Server,
                    },
                    {
                        label: 'Healthy Now',
                        val: loading ? '…' : (healthyCount ?? '—'),
                        sub: 'HTTP 200 on a probe URL',
                        color: 'text-emerald-400',
                        icon: CheckCircle2,
                    },
                    {
                        label: 'Not running',
                        val: loading ? '…' : (notRunningCount ?? '—'),
                        sub: 'connection failed or non-200',
                        color: notRunningCount ? 'text-rose-400' : 'text-slate-500',
                        icon: XCircle,
                    },
                    {
                        label: 'Unreachable',
                        val: loading ? '…' : (unreachableCount ?? '—'),
                        sub: 'TCP / timeout (app down)',
                        color: unreachableCount ? 'text-orange-400' : 'text-slate-500',
                        icon: XCircle,
                    },
                    {
                        label: 'No URL',
                        val: loading ? '…' : (unknownCount ?? '—'),
                        sub: 'no web_interface in config',
                        color: unknownCount ? 'text-amber-400' : 'text-slate-500',
                        icon: AlertCircle,
                    },
                    {
                        label: 'Categories',
                        val: loading ? '…' : (bridgeHealth?.federation?.categories ?? '—'),
                        sub: 'server groups',
                        color: 'text-indigo-400',
                        icon: Heart,
                    },
                ].map((s, i) => (
                    <div key={i} className="sota-card p-5">
                        <div className="flex items-center justify-between mb-3">
                            <s.icon size={18} className={s.color} />
                        </div>
                        <div className={cn("text-3xl font-bold font-outfit mb-1", s.color)}>{s.val}</div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{s.label}</div>
                        <div className="text-[10px] text-slate-600 mt-0.5">{s.sub}</div>
                    </div>
                ))}
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Problem servers */}
                <motion.div variants={item} className="sota-card p-6">
                    <div className="flex items-center gap-3 mb-5">
                        <XCircle size={16} className="text-rose-400" />
                        <h3 className="font-bold text-slate-100">Unreachable servers</h3>
                        {problemServers.length === 0 && !loading && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 ml-auto">All clear</span>
                        )}
                    </div>
                    {loading ? (
                        <div className="text-slate-600 text-sm">Polling…</div>
                    ) : problemServers.length === 0 ? (
                        <div className="text-slate-600 text-sm">
                            {fedHealth ? 'All polled servers responded healthy.' : 'No health data yet — check bridge is running.'}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {problemServers.map(s => (
                                <div key={s.server_id} className="flex items-center gap-3 p-3 rounded-xl bg-rose-500/5 border border-rose-500/10">
                                    <div className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-slate-200 truncate">{s.server_id}</div>
                                        <div className="text-[10px] text-slate-500 truncate">{s.error || s.status}</div>
                                    </div>
                                    <span className="text-[10px] font-bold uppercase text-rose-400">{s.status}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </motion.div>

                {/* Healthy sample */}
                <motion.div variants={item} className="sota-card p-6">
                    <div className="flex items-center gap-3 mb-5">
                        <CheckCircle2 size={16} className="text-emerald-400" />
                        <h3 className="font-bold text-slate-100">Recently healthy</h3>
                        <span className="text-[10px] text-slate-500 ml-auto">top {healthyServers.length}</span>
                    </div>
                    {loading ? (
                        <div className="text-slate-600 text-sm">Polling…</div>
                    ) : healthyServers.length === 0 ? (
                        <div className="text-slate-600 text-sm">No healthy servers yet — bridge must be running.</div>
                    ) : (
                        <div className="space-y-2">
                            {healthyServers.map(s => (
                                <div key={s.server_id} className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/[0.03] border border-emerald-500/10">
                                    <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-slate-200 truncate">{s.server_id}</div>
                                    </div>
                                    {s.response_time !== undefined && (
                                        <span className="text-[10px] font-mono text-slate-500">{s.response_time}ms</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </motion.div>
            </div>

            {/* Quick links */}
            <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-8">
                <div className="sota-card p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <Terminal size={16} className="text-blue-500" />
                        <h3 className="text-sm font-bold uppercase tracking-widest">Bridge endpoints</h3>
                    </div>
                    <div className="space-y-2 text-[11px] font-mono">
                        {[
                            ['Health', bridgePath('/health')],
                            ['Servers', bridgePath('/api/v1/servers')],
                            ['Fed health', bridgePath('/api/v1/federation/health')],
                            ['Uptime', bridgePath('/api/v1/health/uptime')],
                            ['Port map', bridgePath('/api/v1/portmap')],
                            ['API docs', bridgePath('/redoc')],
                        ].map(([label, url]) => (
                            <a
                                key={url}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-blue-400 hover:text-blue-300 hover:underline"
                            >
                                <ExternalLink size={10} className="shrink-0" />
                                <span className="text-slate-500 w-20 shrink-0">{label}</span>
                                <span className="truncate">{url}</span>
                            </a>
                        ))}
                    </div>
                </div>
                <div className="sota-card p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <Zap size={16} className="text-amber-500" />
                        <h3 className="text-sm font-bold uppercase tracking-widest">Start bridge</h3>
                    </div>
                    <pre className="text-[11px] text-slate-400 leading-relaxed bg-black/30 rounded-xl p-4 font-mono overflow-x-auto">
{`# PowerShell (from repo root)
Set-Location .\\bridge
uv run uvicorn app.main:app --host 127.0.0.1 --port 10857 --reload

# bash (from repo root)
# cd bridge && uv run uvicorn app.main:app --host 127.0.0.1 --port 10857 --reload`}
                    </pre>
                    <div className="mt-3 text-[10px] text-slate-500">
                        Or run <code className="text-blue-400">webapp\\start.ps1</code> (bridge + UI), or{' '}
                        <code className="text-blue-400">bridge\\start.bat</code> / <code className="text-blue-400">bridge\\start.ps1</code>.
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default Dashboard;
