import React, { useState, useEffect } from 'react';
import {
    FolderOpen, Search, Wrench, Database, Shield, Zap,
    Globe, Terminal, ArrowRight, Layers, RefreshCw, AlertCircle, Server
} from 'lucide-react';
import { federationApi } from '@/services/api';
import { cn } from '@/lib/utils';

const CATEGORY_ICONS: Record<string, React.ElementType> = {
    'knowledge': Database,
    'smart-home': Globe,
    'vr': Zap,
    'dev-tools': Wrench,
    'creative': Layers,
    'media': Terminal,
    'system': Server,
    'security': Shield,
    'automation': Zap,
    'communication': Globe,
    'ai': Zap,
};

const CATEGORY_COLORS: Record<string, { text: string; bg: string }> = {
    'knowledge': { text: 'text-indigo-400', bg: 'bg-indigo-400/10' },
    'smart-home': { text: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    'vr': { text: 'text-violet-400', bg: 'bg-violet-400/10' },
    'dev-tools': { text: 'text-blue-400', bg: 'bg-blue-400/10' },
    'creative': { text: 'text-amber-400', bg: 'bg-amber-400/10' },
    'media': { text: 'text-rose-400', bg: 'bg-rose-400/10' },
    'system': { text: 'text-cyan-400', bg: 'bg-cyan-400/10' },
    'security': { text: 'text-rose-400', bg: 'bg-rose-400/10' },
    'automation': { text: 'text-yellow-400', bg: 'bg-yellow-400/10' },
};

function getIcon(cat: string) {
    return CATEGORY_ICONS[cat] ?? FolderOpen;
}

function getColor(cat: string) {
    return CATEGORY_COLORS[cat] ?? { text: 'text-slate-400', bg: 'bg-slate-400/10' };
}

interface CategoryEntry {
    name: string;
    servers: any[];
}

const Categories: React.FC = () => {
    const [categories, setCategories] = useState<CategoryEntry[]>([]);
    const [allServers, setAllServers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await federationApi.getServers();
            const servers: any[] = data.servers || [];
            setAllServers(servers);

            // Group by category
            const map: Record<string, any[]> = {};
            for (const s of servers) {
                const cat = s.category || 'uncategorised';
                if (!map[cat]) map[cat] = [];
                map[cat].push(s);
            }
            setCategories(
                Object.entries(map)
                    .map(([name, srvs]) => ({ name, servers: srvs }))
                    .sort((a, b) => b.servers.length - a.servers.length)
            );
        } catch (e: any) {
            setError('Bridge unreachable: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const filtered = categories.filter(c =>
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.servers.some(s => s.name?.toLowerCase().includes(search.toLowerCase()))
    );

    const selectedCat = selected ? categories.find(c => c.name === selected) : null;

    return (
        <div className="space-y-8 animate-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-outfit font-bold tracking-tight gradient-text">Categories</h1>
                    <p className="text-slate-400 mt-1">
                        {allServers.length} servers across {categories.length} categories — grouped by federation-config.json.
                    </p>
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

            {loading ? (
                <div className="sota-card p-10 text-center text-slate-500 text-sm">Loading from bridge…</div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Category list */}
                    <div className="lg:col-span-1 space-y-3">
                        {filtered.map(cat => {
                            const Icon = getIcon(cat.name);
                            const col = getColor(cat.name);
                            return (
                                <button
                                    key={cat.name}
                                    onClick={() => setSelected(selected === cat.name ? null : cat.name)}
                                    className={cn(
                                        "w-full sota-card p-5 flex items-center gap-4 text-left transition-all",
                                        selected === cat.name ? "border-blue-500/30 bg-blue-500/[0.04]" : "hover:border-white/10"
                                    )}
                                >
                                    <div className={cn("p-2.5 rounded-xl shrink-0", col.bg)}>
                                        <Icon size={20} className={col.text} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-slate-100 capitalize">{cat.name}</div>
                                        <div className="text-[10px] text-slate-500">{cat.servers.length} server{cat.servers.length !== 1 ? 's' : ''}</div>
                                    </div>
                                    <ArrowRight size={14} className={cn("shrink-0 transition-transform", selected === cat.name ? "rotate-90 text-blue-400" : "text-slate-600")} />
                                </button>
                            );
                        })}
                        {filtered.length === 0 && (
                            <div className="text-slate-600 text-sm p-4">No categories match your filter.</div>
                        )}
                    </div>

                    {/* Server list for selected category */}
                    <div className="lg:col-span-2">
                        {!selectedCat ? (
                            <div className="sota-card p-10 h-full flex flex-col items-center justify-center text-center text-slate-600 gap-3">
                                <FolderOpen size={32} className="opacity-20" />
                                <span className="text-sm">Select a category to see its servers</span>
                            </div>
                        ) : (
                            <div className="sota-card divide-y divide-white/5">
                                <div className="px-5 py-4 flex items-center gap-3">
                                    <span className="font-bold text-slate-100 capitalize">{selectedCat.name}</span>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400">{selectedCat.servers.length} servers</span>
                                </div>
                                {selectedCat.servers.map(srv => (
                                    <div key={srv.id} className="px-5 py-4 hover:bg-white/[0.02] transition-all">
                                        <div className="flex items-center gap-3">
                                            <div>
                                                <div className="font-medium text-slate-100 text-sm">{srv.name || srv.id}</div>
                                                <div className="text-[10px] text-slate-500 font-mono mt-0.5">{srv.id}</div>
                                                {srv.description && (
                                                    <div className="text-[11px] text-slate-500 mt-1 line-clamp-1">{srv.description}</div>
                                                )}
                                            </div>
                                            {srv.web_interface && (
                                                <a
                                                    href={srv.web_interface}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="ml-auto shrink-0 px-3 py-1 rounded-lg bg-blue-500/10 text-blue-400 text-[10px] font-bold hover:bg-blue-500/20 transition-all"
                                                >
                                                    Open
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Categories;
