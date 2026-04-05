import React, { useState, useEffect } from 'react';
import {
    Settings, RefreshCw, Save, Server, AlertCircle,
    CheckCircle2, ChevronDown, ChevronRight, Edit3
} from 'lucide-react';
import { federationApi } from '@/services/api';
import { cn } from '@/lib/utils';

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
}

interface FederationConfig {
    federation?: { name?: string; ports?: { bridge?: number; dashboard?: number } };
    servers: Record<string, ServerEntry>;
    categories?: Record<string, string[]>;
}

const Config: React.FC = () => {
    const [config, setConfig] = useState<FederationConfig | null>(null);
    const [rawJson, setRawJson] = useState('');
    const [editMode, setEditMode] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [expandedServer, setExpandedServer] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const [serversRes] = await Promise.all([
                federationApi.getServers(),
            ]);
            const servers: Record<string, any> = {};
            for (const s of serversRes.servers || []) servers[s.id] = s;
            const cfg: FederationConfig = {
                federation: { ports: { bridge: 10857, dashboard: 10856 } },
                servers,
            };
            setConfig(cfg);
            setRawJson(JSON.stringify(cfg, null, 2));
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleSaveRaw = async () => {
        setSaving(true);
        setError(null);
        try {
            const parsed = JSON.parse(rawJson);
            await federationApi.saveConfig(parsed, true);
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
            await load();
        } catch (e: any) {
            if (e.message?.includes('JSON') || e instanceof SyntaxError) {
                setError('Invalid JSON: ' + e.message);
            } else {
                setError('Save failed: ' + (e.response?.data?.detail ?? e.message));
            }
        } finally {
            setSaving(false);
        }
    };

    const servers = config ? Object.values(config.servers) : [];

    return (
        <div className="space-y-8 animate-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-outfit font-bold tracking-tight gradient-text">Federation Config</h1>
                    <p className="text-slate-400 mt-1">
                        Live view of registered MCP servers. Edit Raw JSON to modify <code className="text-blue-400">federation-config.json</code>.
                    </p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={load}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm font-bold hover:bg-white/10 transition-all"
                    >
                        <RefreshCw size={14} /> Reload
                    </button>
                    <button
                        onClick={() => { setEditMode(!editMode); setError(null); }}
                        className={cn(
                            'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border',
                            editMode
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                        )}
                    >
                        <Edit3 size={14} /> {editMode ? 'Cancel' : 'Edit JSON'}
                    </button>
                    {editMode && (
                        <button
                            onClick={handleSaveRaw}
                            disabled={saving}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 text-white text-sm font-bold hover:bg-blue-600 transition-all disabled:opacity-50"
                        >
                            {saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
                            {saved ? 'Saved!' : saving ? 'Saving…' : 'Save'}
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                    <AlertCircle size={16} /> {error}
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Registered Servers', val: loading ? '…' : servers.length },
                    { label: 'Categories', val: loading ? '…' : (config?.categories ? Object.keys(config.categories).length : '—') },
                    { label: 'Bridge Port', val: 10857 },
                    { label: 'Dashboard Port', val: 10856 },
                ].map((s, i) => (
                    <div key={i} className="sota-card p-4">
                        <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">{s.label}</span>
                        <span className="text-2xl font-bold font-outfit">{s.val}</span>
                    </div>
                ))}
            </div>

            {editMode ? (
                <div className="sota-card p-6">
                    <div className="flex items-center gap-2 mb-3">
                        <Settings size={15} className="text-amber-400" />
                        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                            federation-config.json — edits saved directly to disk and hot-reloaded
                        </span>
                    </div>
                    <textarea
                        value={rawJson}
                        onChange={e => setRawJson(e.target.value)}
                        className="w-full h-[60vh] bg-black/40 rounded-xl p-4 font-mono text-xs text-blue-400/90 border border-white/5 focus:outline-none focus:ring-1 focus:ring-blue-500/40 resize-none"
                        spellCheck={false}
                    />
                </div>
            ) : (
                <div className="sota-card divide-y divide-white/5">
                    {loading ? (
                        <div className="p-10 text-center text-slate-500 text-sm">Loading from bridge…</div>
                    ) : servers.length === 0 ? (
                        <div className="p-10 text-center text-slate-500 text-sm">
                            No servers registered — check bridge is running and federation-config.json has a "servers" key.
                        </div>
                    ) : (
                        servers.map(srv => (
                            <div key={srv.id}>
                                <button
                                    onClick={() => setExpandedServer(expandedServer === srv.id ? null : srv.id)}
                                    className="w-full flex items-center gap-4 p-4 hover:bg-white/[0.02] transition-all text-left"
                                >
                                    <div className="p-2 rounded-lg bg-white/5 text-blue-400 shrink-0">
                                        <Server size={15} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-bold text-slate-100 text-sm">{srv.name || srv.id}</span>
                                            {srv.category && (
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 uppercase">{srv.category}</span>
                                            )}
                                            {srv.tier && (
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/5 text-slate-500 uppercase">{srv.tier}</span>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">{srv.id}</p>
                                    </div>
                                    {expandedServer === srv.id
                                        ? <ChevronDown size={14} className="text-slate-500 shrink-0" />
                                        : <ChevronRight size={14} className="text-slate-500 shrink-0" />}
                                </button>

                                {expandedServer === srv.id && (
                                    <div className="px-4 pb-4 ml-11 space-y-2">
                                        {srv.description && (
                                            <p className="text-xs text-slate-400 mb-3">{srv.description}</p>
                                        )}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 font-mono text-[11px]">
                                            {[
                                                { label: 'MCP Endpoint', val: srv.mcp_endpoint, color: 'text-blue-400' },
                                                { label: 'Health Endpoint', val: srv.health_endpoint, color: 'text-emerald-400' },
                                                { label: 'Web Interface', val: srv.web_interface, color: 'text-indigo-400', link: true },
                                            ].filter(f => f.val).map(f => (
                                                <div key={f.label} className="p-3 rounded-lg bg-black/30 border border-white/5">
                                                    <span className="text-slate-500 block mb-1 font-sans text-[9px] font-bold uppercase tracking-widest">{f.label}</span>
                                                    {f.link ? (
                                                        <a href={f.val} target="_blank" rel="noopener noreferrer" className={cn(f.color, 'hover:underline truncate block')}>{f.val}</a>
                                                    ) : (
                                                        <span className={cn(f.color, 'truncate block')}>{f.val}</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default Config;
