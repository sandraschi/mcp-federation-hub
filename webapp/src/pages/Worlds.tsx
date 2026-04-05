import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal, RefreshCw, Download, Trash2, AlertCircle, Wifi, WifiOff, Info } from 'lucide-react';
import { federationApi } from '@/services/api';
import { cn } from '@/lib/utils';

interface LogEntry {
    ts: string;
    level: 'INFO' | 'WARNING' | 'ERROR' | 'DEBUG';
    msg: string;
}

function levelColor(level: LogEntry['level']) {
    switch (level) {
        case 'ERROR': return 'text-rose-400';
        case 'WARNING': return 'text-amber-400';
        case 'DEBUG': return 'text-slate-500';
        default: return 'text-slate-300';
    }
}

function levelBadge(level: LogEntry['level']) {
    switch (level) {
        case 'ERROR': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
        case 'WARNING': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
        case 'DEBUG': return 'bg-white/5 text-slate-500 border-white/10';
        default: return 'bg-blue-500/5 text-blue-400 border-blue-500/10';
    }
}

function parseEntries(raw: any[]): LogEntry[] {
    return raw.map((e: any) => ({
        ts: new Date().toISOString(),
        level: (e.level || 'INFO') as LogEntry['level'],
        msg: `[${e.server}] ${e.msg}`,
    }));
}

const MAX_LOGS = 1000;

const Logs: React.FC = () => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [sseStatus, setSseStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('closed');
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<'ALL' | LogEntry['level']>('ALL');
    const [autoScroll, setAutoScroll] = useState(true);
    const [search, setSearch] = useState('');
    const bottomRef = useRef<HTMLDivElement>(null);
    const esRef = useRef<EventSource | null>(null);

    const appendEntries = useCallback((entries: LogEntry[]) => {
        setLogs(prev => {
            const combined = [...prev, ...entries];
            return combined.slice(-MAX_LOGS);
        });
    }, []);

    const connect = useCallback(() => {
        // Close any existing connection
        if (esRef.current) {
            esRef.current.close();
            esRef.current = null;
        }

        const url = federationApi.getLogStreamUrl();
        setSseStatus('connecting');
        setError(null);

        const es = new EventSource(url);
        esRef.current = es;

        es.onopen = () => setSseStatus('open');

        es.onmessage = (ev) => {
            try {
                const data = JSON.parse(ev.data);
                const entries = parseEntries(data.entries || []);
                if (entries.length > 0) appendEntries(entries);
            } catch { /* ignore parse errors */ }
        };

        es.onerror = () => {
            setSseStatus('error');
            setError('SSE stream disconnected — will retry in 10s');
            es.close();
            esRef.current = null;
            setTimeout(connect, 10000);
        };
    }, [appendEntries]);

    // Initial load via REST (instant data), then connect SSE
    const initialLoad = useCallback(async () => {
        try {
            const data = await federationApi.getRecentLogs(500);
            const entries = parseEntries(data.entries || []);
            setLogs(entries);
        } catch (e: any) {
            setError('Bridge unreachable: ' + e.message);
        }
        connect();
    }, [connect]);

    useEffect(() => {
        initialLoad();
        return () => {
            esRef.current?.close();
            esRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (autoScroll && bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, autoScroll]);

    const filtered = logs.filter(l => {
        if (filter !== 'ALL' && l.level !== filter) return false;
        if (search && !l.msg.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    const counts: Record<string, number> = { ALL: logs.length, INFO: 0, WARNING: 0, ERROR: 0, DEBUG: 0 };
    for (const l of logs) counts[l.level] = (counts[l.level] || 0) + 1;

    const handleExport = () => {
        const blob = new Blob(
            [logs.map(l => `[${l.ts}] ${l.level.padEnd(7)} ${l.msg}`).join('\n')],
            { type: 'text/plain' }
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `mcp-logs-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const statusColor = sseStatus === 'open' ? 'bg-emerald-400' : sseStatus === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-rose-500';
    const statusLabel = sseStatus === 'open' ? 'SSE live' : sseStatus === 'connecting' ? 'connecting…' : 'disconnected';

    return (
        <div className="h-[calc(100vh-140px)] flex flex-col gap-4 animate-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-outfit font-bold tracking-tight gradient-text">Logs</h1>
                    <p className="text-slate-400 mt-1">
                        Real-time MCP server logs via SSE stream — tails Claude AppData log files.
                    </p>
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                    {/* SSE status */}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-bold">
                        <div className={cn("w-2 h-2 rounded-full", statusColor)} />
                        {statusLabel}
                    </div>

                    <button
                        onClick={() => setAutoScroll(!autoScroll)}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all",
                            autoScroll ? "bg-blue-500/10 border-blue-500/20 text-blue-400" : "bg-white/5 border-white/10 text-slate-400"
                        )}
                    >
                        <Wifi size={12} /> Auto-scroll
                    </button>

                    <button
                        onClick={connect}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-xs font-bold hover:bg-white/10 transition-all"
                    >
                        <RefreshCw size={12} /> Reconnect
                    </button>

                    <button
                        onClick={handleExport}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-xs font-bold hover:bg-white/10 transition-all"
                    >
                        <Download size={12} /> Export
                    </button>

                    <button
                        onClick={() => setLogs([])}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold hover:bg-rose-500/20 transition-all"
                    >
                        <Trash2 size={12} /> Clear
                    </button>
                </div>
            </div>

            {/* Filter tabs + search */}
            <div className="flex gap-2 flex-wrap items-center">
                {(['ALL', 'INFO', 'WARNING', 'ERROR', 'DEBUG'] as const).map(lvl => (
                    <button
                        key={lvl}
                        onClick={() => setFilter(lvl)}
                        className={cn(
                            "px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border transition-all",
                            filter === lvl
                                ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                                : "bg-white/[0.02] border-white/5 text-slate-500 hover:text-slate-300"
                        )}
                    >
                        {lvl} <span className="opacity-60">{counts[lvl] || 0}</span>
                    </button>
                ))}
                <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search…"
                    className="ml-auto h-8 px-3 bg-white/[0.02] border border-white/5 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/40 w-44"
                />
            </div>

            {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs shrink-0">
                    <AlertCircle size={13} /> {error}
                </div>
            )}

            {/* Log terminal */}
            <div className="sota-card flex-1 flex flex-col overflow-hidden bg-black/30 min-h-0">
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 shrink-0">
                    <Terminal size={13} className="text-slate-500" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        {filtered.length} entries shown / {logs.length} total
                    </span>
                    <div className={cn("ml-auto w-2 h-2 rounded-full", statusColor)} />
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar font-mono text-[11px] leading-relaxed p-3 space-y-0.5">
                    {filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-slate-600">
                            <Info size={20} className="mb-2 opacity-30" />
                            <span className="text-xs">
                                {logs.length === 0
                                    ? 'No logs yet — bridge running? Claude AppData logs may be empty.'
                                    : 'No entries match your filter.'}
                            </span>
                        </div>
                    ) : (
                        filtered.map((entry, i) => (
                            <div key={i} className="flex items-start gap-2 hover:bg-white/[0.02] px-1.5 py-0.5 rounded">
                                <span className="text-slate-600 shrink-0 text-[10px] pt-px tabular-nums w-16">
                                    {new Date(entry.ts).toLocaleTimeString()}
                                </span>
                                <span className={cn(
                                    "text-[10px] font-bold px-1 py-px rounded border shrink-0 uppercase w-14 text-center",
                                    levelBadge(entry.level)
                                )}>
                                    {entry.level}
                                </span>
                                <span className={cn(levelColor(entry.level), "break-all")}>{entry.msg}</span>
                            </div>
                        ))
                    )}
                    <div ref={bottomRef} />
                </div>
            </div>
        </div>
    );
};

export default Logs;
