import React, { useState, useEffect, useCallback } from 'react';
import {
    Server, Globe, Activity, RefreshCw, ExternalLink,
    AlertCircle, Search, Play, Square, Link2, Pause, Save, Layers, HardDrive
} from 'lucide-react';
import { federationApi } from '@/services/api';
import { Switch } from '@/components/ui/switch';
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
    supervised?: boolean;
}

interface HealthResult {
    server_id: string;
    status: string;
    response_time?: number;
    error?: string;
}

interface SupervisorState {
    consecutive_failures?: number;
    restart_attempts?: number;
    backoff_until?: string | null;
    paused?: boolean;
    supervised?: boolean;
    last_restart_at?: string | null;
    restart_history?: any[];
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
    const [supervisorState, setSupervisorState] = useState<Record<string, SupervisorState>>({});
    const [togglingSupervised, setTogglingSupervised] = useState<string | null>(null);
    const [pausing, setPausing] = useState<string | null>(null);
    const [bootOpen, setBootOpen] = useState(false);
    const [bootSelection, setBootSelection] = useState<Record<string, boolean>>({});
    const [savingBoot, setSavingBoot] = useState(false);
    const [nssmOpen, setNssmOpen] = useState(false);
    const [nssmSelection, setNssmSelection] = useState<Record<string, boolean>>({});
    const [nssmStatus, setNssmStatus] = useState<Record<string, {
        nssm_status?: string;
        installed?: boolean;
        port_listening?: boolean;
        running?: boolean;
        selected?: boolean;
        is_app_wrapper?: boolean;
    }>>({});
    const [nssmSummary, setNssmSummary] = useState<{ selected_count?: number; running_count?: number; installed_count?: number; selected_running?: number; fleet_rss_mb?: number }>({});
    const [nssmCatalog, setNssmCatalog] = useState<{
        id: string;
        name: string;
        is_app_wrapper?: boolean;
        recommended_nssm?: boolean;
        bootstrap_member?: boolean;
        nssm_future?: boolean;
        nssm_installed?: boolean;
        heavy_memory?: boolean;
    }[]>([]);
    const [nssmPresets, setNssmPresets] = useState<Record<string, string[]>>({});
    const [savingNssm, setSavingNssm] = useState(false);
    const [loadingNssmStatus, setLoadingNssmStatus] = useState(false);
    const [fleetMemory, setFleetMemory] = useState<Record<string, { rss_mb?: number; heavy_memory?: boolean }>>({});
    const [memorySummary, setMemorySummary] = useState<{
        fleet_rss_mb?: number;
        fleet_process_count?: number;
        system_ram_pct?: number;
    }>({});

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

    const loadFleetMemory = useCallback(async () => {
        try {
            const data = await federationApi.getFleetMemory(false);
            const map: Record<string, { rss_mb?: number; heavy_memory?: boolean }> = {};
            for (const row of data.servers || []) {
                if (row.server_id) map[row.server_id] = row;
            }
            setFleetMemory(map);
            setMemorySummary({
                fleet_rss_mb: data.fleet_rss_mb,
                fleet_process_count: data.fleet_process_count,
                system_ram_pct: data.system_ram_pct,
            });
        } catch { /* bridge down */ }
    }, []);

    const checkAllHealth = useCallback(async () => {
        setCheckingAll(true);
        try {
            const data = await federationApi.getHealth();
            const map: Record<string, HealthResult> = {};
            for (const h of data.server_health || []) map[h.server_id] = h;
            setHealth(map);
            await loadFleetMemory();
        } catch (e: any) {
            toast.error('Health check failed: ' + e.message);
        } finally {
            setCheckingAll(false);
        }
    }, [loadFleetMemory]);

    const loadSupervisorStatus = useCallback(async () => {
        try {
            const data = await federationApi.getSupervisorStatus();
            setSupervisorState(data.servers || {});
        } catch { }
    }, []);

    useEffect(() => {
        loadServers().then(() => checkAllHealth().then(loadSupervisorStatus));
    }, []);

    const loadBootConfig = useCallback(async () => {
        try {
            const cfg = await federationApi.getConfig();
            const sel: Record<string, boolean> = {};
            for (const [id, s] of Object.entries(cfg?.servers ?? {}) as [string, any][]) {
                if (s?.supervised !== false) sel[id] = true;
            }
            setBootSelection(sel);
        } catch { }
    }, []);

    const presets: Record<string, string[]> = {
        'Gold': servers.filter(s => s.tier === 'gold').map(s => s.id),
        'Gold+Showcase': servers.filter(s => s.tier === 'gold' || s.tier === 'showcase').map(s => s.id),
        'Creative+Infra': servers.filter(s => s.tier === 'creative' || s.tier === 'infrastructure').map(s => s.id),
        'All': servers.map(s => s.id),
    };

    const applyPreset = (ids: string[]) => {
        const sel: Record<string, boolean> = {};
        for (const s of servers) sel[s.id] = ids.includes(s.id);
        setBootSelection(sel);
    };

    const handleSaveBoot = async () => {
        setSavingBoot(true);
        try {
            const cfg = await federationApi.getConfig();
            for (const [id, sv] of Object.entries(cfg.servers ?? {}) as [string, any][]) {
                const isOn = bootSelection[id] ?? true;
                if (isOn && sv.supervised === false) delete sv.supervised;
                else if (!isOn && sv.supervised !== false) sv.supervised = false;
            }
            await federationApi.saveConfig(cfg);
            toast.success('Bootstrap config saved — will apply on next hub restart');
        } catch (e: any) {
            toast.error(`Save failed: ${e.response?.data?.detail ?? e.message}`);
        } finally {
            setSavingBoot(false);
        }
    };

    const loadNssmPanel = useCallback(async () => {
        try {
            const catalog = await federationApi.getNssmCatalog();
            setNssmCatalog(catalog.catalog || []);
            setNssmPresets(catalog.presets || {});
            const sel: Record<string, boolean> = {};
            for (const row of catalog.catalog || []) {
                sel[row.id] = !!row.selected;
            }
            setNssmSelection(sel);
        } catch { /* bridge may be down */ }
    }, []);

    const refreshNssmStatus = useCallback(async () => {
        setLoadingNssmStatus(true);
        try {
            const data = await federationApi.getNssmStatus(true);
            const map: Record<string, any> = {};
            for (const row of data.servers || []) {
                if (row.server_id) map[row.server_id] = row;
            }
            setNssmStatus(map);
            setNssmSummary(data.summary || {});
            const memMap: Record<string, { rss_mb?: number; heavy_memory?: boolean }> = {};
            for (const row of data.servers || []) {
                if (row.server_id) {
                    memMap[row.server_id] = {
                        rss_mb: row.rss_mb,
                        heavy_memory: row.heavy_memory,
                    };
                }
            }
            setFleetMemory(prev => ({ ...prev, ...memMap }));
            if (data.summary?.fleet_rss_mb != null) {
                setMemorySummary(prev => ({
                    ...prev,
                    fleet_rss_mb: data.summary.fleet_rss_mb,
                }));
            }
        } catch (e: any) {
            toast.error('NSSM status: ' + (e.message || 'failed'));
        } finally {
            setLoadingNssmStatus(false);
        }
    }, []);

    const applyNssmPreset = (ids: string[]) => {
        const sel: Record<string, boolean> = {};
        for (const row of nssmCatalog) sel[row.id] = ids.includes(row.id);
        setNssmSelection(sel);
    };

    const handleSaveNssm = async () => {
        setSavingNssm(true);
        try {
            const selected = Object.entries(nssmSelection)
                .filter(([, on]) => on)
                .map(([id]) => id);
            await federationApi.saveNssmConfig(selected);
            toast.success('NSSM selection saved — run install-mcp-services.ps1 -Apply as Admin');
            await refreshNssmStatus();
        } catch (e: any) {
            toast.error(`NSSM save failed: ${e.response?.data?.detail ?? e.message}`);
        } finally {
            setSavingNssm(false);
        }
    };

    useEffect(() => {
        if (!nssmOpen) return;
        loadNssmPanel().then(() => refreshNssmStatus());
        const t = setInterval(() => refreshNssmStatus(), 15000);
        return () => clearInterval(t);
    }, [nssmOpen, loadNssmPanel, refreshNssmStatus]);

    const handlePause = async (srv: ServerEntry) => {
        setPausing(srv.id);
        try {
            await federationApi.pauseSupervision(srv.id);
            toast.success(`Paused supervision for ${srv.name || srv.id}`);
            await loadSupervisorStatus();
        } catch (e: any) {
            toast.error(`Pause failed: ${e.response?.data?.detail ?? e.message}`);
        } finally {
            setPausing(null);
        }
    };

    const handleResume = async (srv: ServerEntry) => {
        setPausing(srv.id);
        try {
            await federationApi.resumeSupervision(srv.id);
            toast.success(`Resumed supervision for ${srv.name || srv.id}`);
            await loadSupervisorStatus();
        } catch (e: any) {
            toast.error(`Resume failed: ${e.response?.data?.detail ?? e.message}`);
        } finally {
            setPausing(null);
        }
    };

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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
                    <div className="sota-card p-4 border-violet-500/10">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Fleet RAM</span>
                        <span className="text-2xl font-bold font-outfit text-violet-300">
                            {memorySummary.fleet_rss_mb != null
                                ? `${memorySummary.fleet_rss_mb} MiB`
                                : '—'}
                        </span>
                        {memorySummary.system_ram_pct != null && (
                            <span className="text-[10px] text-slate-500 block mt-0.5">
                                system {memorySummary.system_ram_pct}%
                            </span>
                        )}
                    </div>
                    <div className="sota-card p-4 border-rose-500/10">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Unreachable</span>
                        <span className="text-2xl font-bold font-outfit text-rose-400">
                            {checkedCount > 0 ? checkedCount - healthyCount : '—'}
                        </span>
                    </div>
                </div>
            )}

            {/* NSSM optional (hybrid) */}
            <div className="sota-card overflow-hidden">
                <button
                    onClick={() => { setNssmOpen(!nssmOpen); if (!nssmOpen) loadNssmPanel(); }}
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/[0.02] transition-colors"
                >
                    <HardDrive size={16} className="text-amber-400/90" />
                    <span className="font-bold text-slate-200">Windows services (NSSM) — optional</span>
                    <span className="text-[10px] text-slate-500 ml-auto">
                        bridge NSSM + {nssmSummary.installed_count ?? 0} MCP service(s)
                    </span>
                </button>
                {nssmOpen && (
                    <div className="border-t border-white/5 p-4 space-y-4">
                        <p className="text-[11px] text-slate-500">
                            <strong className="text-slate-400">Hybrid:</strong> only <span className="font-mono">mcp-federation-hub</span> is required as a Windows service.
                            The bridge bootstrap + supervisor starts the fleet (see Bootstrap Config above).
                            Check servers here only if you want a <em>separate</em> NSSM service (e.g. fleet-agent later).
                            After Save, run <span className="font-mono text-slate-400">bridge\install-mcp-services.ps1 -Apply</span> as Admin.
                            Set <span className="font-mono">supervised: false</span> on NSSM MCPs to avoid double-start.
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                            <div className="sota-card p-3 border-emerald-500/10">
                                <span className="text-[10px] uppercase tracking-widest text-slate-500 block">Selected</span>
                                <span className="text-lg font-bold text-slate-200">{nssmSummary.selected_count ?? '—'}</span>
                            </div>
                            <div className="sota-card p-3 border-blue-500/10">
                                <span className="text-[10px] uppercase tracking-widest text-slate-500 block">Installed</span>
                                <span className="text-lg font-bold text-slate-200">{nssmSummary.installed_count ?? '—'}</span>
                            </div>
                            <div className="sota-card p-3 border-emerald-500/10">
                                <span className="text-[10px] uppercase tracking-widest text-slate-500 block">Running now</span>
                                <span className="text-lg font-bold text-emerald-400">{nssmSummary.running_count ?? '—'}</span>
                            </div>
                            <div className="sota-card p-3 border-violet-500/10">
                                <span className="text-[10px] uppercase tracking-widest text-slate-500 block">NSSM fleet RAM</span>
                                <span className="text-lg font-bold text-violet-300">
                                    {nssmSummary.fleet_rss_mb != null ? `${nssmSummary.fleet_rss_mb} MiB` : '—'}
                                </span>
                            </div>
                            <div className="sota-card p-3">
                                <button
                                    onClick={() => refreshNssmStatus()}
                                    disabled={loadingNssmStatus}
                                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-slate-300 hover:bg-white/10 disabled:opacity-50"
                                >
                                    <RefreshCw size={12} className={loadingNssmStatus ? 'animate-spin' : ''} />
                                    Refresh status
                                </button>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {[
                                ['Candidates', nssmPresets.candidates || []],
                                ['None', []],
                            ].map(([label, ids]) => (
                                <button
                                    key={String(label)}
                                    onClick={() => applyNssmPreset(ids as string[])}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-900/20 border border-emerald-700/30 text-xs font-bold text-emerald-300 hover:bg-emerald-900/40 transition-colors"
                                >
                                    {label}
                                </button>
                            ))}
                            <div className="flex-1" />
                            <button
                                onClick={handleSaveNssm}
                                disabled={savingNssm}
                                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-600/30 text-xs font-bold text-emerald-300 hover:bg-emerald-600/30 transition-colors disabled:opacity-50"
                            >
                                <Save size={12} />
                                {savingNssm ? 'Saving…' : 'Save NSSM'}
                            </button>
                        </div>
                        <div className="max-h-72 overflow-y-auto space-y-0.5">
                            {(nssmCatalog.length ? nssmCatalog : []).map(row => {
                                const st = nssmStatus[row.id];
                                const mem = fleetMemory[row.id] ?? (st ? { rss_mb: (st as any).rss_mb, heavy_memory: (st as any).heavy_memory } : undefined);
                                const checked = nssmSelection[row.id] ?? false;
                                const running = st?.running;
                                const nssmSt = st?.nssm_status ?? (st?.installed ? 'installed' : '—');
                                return (
                                    <label
                                        key={row.id}
                                        className="flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-white/[0.02] cursor-pointer transition-colors"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => setNssmSelection(p => ({ ...p, [row.id]: !checked }))}
                                            className="accent-emerald-500 w-3.5 h-3.5 rounded"
                                        />
                                        <span className={cn('text-xs font-medium flex-1', checked ? 'text-slate-200' : 'text-slate-600')}>
                                            {row.name || row.id}
                                            {row.is_app_wrapper && (
                                                <span className="ml-2 text-[9px] uppercase text-amber-500/80">app</span>
                                            )}
                                            {row.heavy_memory && (
                                                <span className="ml-2 text-[9px] uppercase text-violet-400/80" title="LanceDB / RAG — high RAM">rag</span>
                                            )}
                                            {row.bootstrap_member && (
                                                <span className="ml-2 text-[9px] uppercase text-blue-400/70" title="Also in bootstrap-20">boot</span>
                                            )}
                                            {row.nssm_future && (
                                                <span className="ml-2 text-[9px] uppercase text-slate-500">soon</span>
                                            )}
                                        </span>
                                        <span className="text-[10px] font-mono text-violet-400/90 w-14 text-right">
                                            {mem?.rss_mb != null ? `${mem.rss_mb}M` : '—'}
                                        </span>
                                        <span className={cn(
                                            'text-[10px] font-mono uppercase w-16 text-right',
                                            running ? 'text-emerald-400' : checked ? 'text-amber-500' : 'text-slate-600'
                                        )}>
                                            {checked ? (running ? 'up' : nssmSt.replace('SERVICE_', '')) : 'off'}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Bootstrap Config */}
            <div className="sota-card overflow-hidden">
                <button
                    onClick={() => { setBootOpen(!bootOpen); if (!bootOpen) loadBootConfig(); }}
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/[0.02] transition-colors"
                >
                    <Layers size={16} className="text-fleet-400" />
                    <span className="font-bold text-slate-200">Always-on fleet (bootstrap + supervisor)</span>
                    <span className="text-[10px] text-slate-500 ml-auto">
                        {Object.keys(bootSelection).length > 0
                            ? `${Object.values(bootSelection).filter(Boolean).length} selected`
                            : 'load to edit'}
                    </span>
                </button>
                {bootOpen && (
                    <div className="border-t border-white/5 p-4 space-y-4">
                        <p className="text-[11px] text-slate-500">
                            Bridge starts these after ~135s and the supervisor restarts them on failure.
                            Curated list is in <span className="font-mono">bridge/app/config.py</span> (BOOTSTRAP_SERVERS).
                            Not the same as optional NSSM services below.
                        </p>
                        <div className="flex items-center gap-3">
                            <button onClick={() => { const s: Record<string, boolean> = {}; servers.forEach(x => s[x.id] = true); setBootSelection(s); }}
                                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-slate-300 hover:bg-white/10 transition-colors">
                                Check All
                            </button>
                            <button onClick={() => { const s: Record<string, boolean> = {}; servers.forEach(x => s[x.id] = false); setBootSelection(s); }}
                                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-slate-300 hover:bg-white/10 transition-colors">
                                Uncheck All
                            </button>
                            <div className="w-px h-5 bg-white/10 mx-1" />
                            {Object.entries(presets).map(([label, ids]) => (
                                <button key={label} onClick={() => applyPreset(ids)}
                                    className="px-3 py-1.5 rounded-lg bg-fleet-900/20 border border-fleet-700/30 text-xs font-bold text-fleet-300 hover:bg-fleet-900/40 transition-colors">
                                    {label}
                                </button>
                            ))}
                            <div className="flex-1" />
                            <button
                                onClick={handleSaveBoot}
                                disabled={savingBoot}
                                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-600/30 text-xs font-bold text-emerald-300 hover:bg-emerald-600/30 transition-colors disabled:opacity-50"
                            >
                                <Save size={12} />
                                {savingBoot ? 'Saving…' : 'Save'}
                            </button>
                        </div>
                        <div className="max-h-64 overflow-y-auto space-y-0.5">
                            {servers.map(s => (
                                <label
                                    key={s.id}
                                    className="flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-white/[0.02] cursor-pointer transition-colors"
                                >
                                    <input
                                        type="checkbox"
                                        checked={bootSelection[s.id] ?? true}
                                        onChange={() => setBootSelection(p => ({ ...p, [s.id]: !(p[s.id] ?? true) }))}
                                        className="accent-fleet-500 w-3.5 h-3.5 rounded"
                                    />
                                    <span className={cn(
                                        'text-xs font-medium',
                                        (bootSelection[s.id] ?? true) ? 'text-slate-200' : 'text-slate-600'
                                    )}>{s.name || s.id}</span>
                                    <span className="text-[10px] text-slate-500 ml-auto">{s.tier ?? ''}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}
            </div>

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
                                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 hidden lg:table-cell">Supervisor</th>
                                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 hidden lg:table-cell">RAM</th>
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
                                        <td className="px-4 py-3 hidden lg:table-cell">
                                            <div className="flex items-center gap-2">
                                                {(() => {
                                                    const sv = supervisorState[srv.id];
                                                    const isSupervised = sv?.supervised ?? true;
                                                    const isPaused = sv?.paused ?? false;
                                                    const fails = sv?.consecutive_failures ?? 0;
                                                    return (
                                                        <>
                                                            <span className={cn(
                                                                'text-[10px] font-bold uppercase',
                                                                isPaused ? 'text-amber-400' : isSupervised ? 'text-emerald-400' : 'text-slate-500'
                                                            )}>
                                                                {isPaused ? 'Paused' : isSupervised ? 'On' : 'Off'}
                                                            </span>
                                                            {fails > 0 && (
                                                                <span className="text-[10px] font-mono text-rose-400" title="Consecutive failures">
                                                                    {fails}x
                                                                </span>
                                                            )}
                                                            {sv?.restart_attempts ? (
                                                                <span className="text-[10px] font-mono text-slate-500" title="Restart attempts">
                                                                    r{sv.restart_attempts}
                                                                </span>
                                                            ) : null}
                                                            {isSupervised && (
                                                                <button
                                                                    onClick={() => isPaused ? handleResume(srv) : handlePause(srv)}
                                                                    disabled={pausing === srv.id}
                                                                    className={cn(
                                                                        'p-1 rounded text-[10px] font-bold transition-all disabled:opacity-40',
                                                                        isPaused
                                                                            ? 'text-emerald-400 hover:bg-emerald-500/10'
                                                                            : 'text-amber-400 hover:bg-amber-500/10'
                                                                    )}
                                                                    title={isPaused ? 'Resume supervision' : 'Pause supervision'}
                                                                >
                                                                    {pausing === srv.id
                                                                        ? <RefreshCw size={11} className="animate-spin" />
                                                                        : isPaused ? <Play size={11} fill="currentColor" /> : <Pause size={11} />}
                                                                </button>
                                                            )}
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 hidden lg:table-cell font-mono text-[11px] text-violet-400/90">
                                            {fleetMemory[srv.id]?.rss_mb != null
                                                ? `${fleetMemory[srv.id].rss_mb} MiB`
                                                : '—'}
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
