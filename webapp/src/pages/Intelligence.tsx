import React, { useState, useEffect, useCallback } from 'react';
import {
    Cpu, Database, Brain, Bot, RefreshCw, ExternalLink,
    AlertCircle, CheckCircle2, Activity, Zap
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { federationApi } from '@/services/api';
import { bridgePath } from '@/lib/bridgeUrl';
import { cn } from '@/lib/utils';

interface GpuInfo {
    available: boolean;
    error?: string;
    gpu_count?: number;
    gpus?: Array<{
        name: string;
        driver_version: string;
        utilization_gpu_pct: number;
        utilization_memory_pct: number;
        memory_used_mb: number;
        memory_total_mb: number;
        temperature_c: number;
        power_draw_w: number;
    }>;
}

interface OllamaModel {
    name: string;
    size_gb: number;
    family: string;
    parameter_size: string;
    quantization: string;
}

interface OllamaInfo {
    available: boolean;
    error?: string;
    model_count?: number;
    models?: OllamaModel[];
}

interface OllamaRunning {
    available: boolean;
    models?: Array<{ name: string; size: number }>;
}

// Sliding window for GPU sparkline — last 20 samples
const MAX_SPARKLINE = 20;

const LocalAI: React.FC = () => {
    const [gpu, setGpu] = useState<GpuInfo | null>(null);
    const [ollama, setOllama] = useState<OllamaInfo | null>(null);
    const [running, setRunning] = useState<OllamaRunning | null>(null);
    const [sparkline, setSparkline] = useState<Array<{ t: string; load: number; vram: number }>>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        const [gpuData, ollamaData, runningData] = await Promise.allSettled([
            federationApi.getGpuStats(),
            federationApi.getOllamaModels(),
            federationApi.getOllamaRunning(),
        ]);

        if (gpuData.status === 'fulfilled') {
            const g: GpuInfo = gpuData.value;
            setGpu(g);
            if (g.available && g.gpus?.[0]) {
                const gpu0 = g.gpus[0];
                const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                setSparkline(prev => [
                    ...prev.slice(-(MAX_SPARKLINE - 1)),
                    {
                        t: now,
                        load: gpu0.utilization_gpu_pct,
                        vram: Math.round(100 * gpu0.memory_used_mb / gpu0.memory_total_mb),
                    }
                ]);
            }
        }
        if (ollamaData.status === 'fulfilled') setOllama(ollamaData.value);
        if (runningData.status === 'fulfilled') setRunning(runningData.value);
        setLoading(false);
    }, []);

    useEffect(() => {
        load();
        const id = setInterval(() => load(true), 10000);  // refresh every 10s
        return () => clearInterval(id);
    }, [load]);

    const gpu0 = gpu?.gpus?.[0];

    return (
        <div className="space-y-8 animate-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-outfit font-bold tracking-tight gradient-text">Local AI</h1>
                    <p className="text-slate-400 mt-1">GPU telemetry (nvidia-smi) + Ollama model registry. Refreshes every 10s.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => load()}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm font-bold hover:bg-white/10 transition-all disabled:opacity-50"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
                    </button>
                    <div className={cn(
                        "flex items-center gap-3 px-4 py-2 sota-card",
                        gpu?.available ? "border-blue-500/20" : "border-slate-700/40"
                    )}>
                        <Cpu size={16} className={gpu?.available ? "text-blue-400" : "text-slate-600"} />
                        <span className={cn("text-sm font-bold", gpu?.available ? "text-blue-400" : "text-slate-500")}>
                            {loading ? '…' : gpu?.available ? (gpu0?.name ?? 'GPU detected') : 'No GPU / nvidia-smi not found'}
                        </span>
                    </div>
                </div>
            </div>

            {/* GPU stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    {
                        label: 'GPU Utilization',
                        val: gpu?.available && gpu0 ? `${gpu0.utilization_gpu_pct}%` : '—',
                        sub: gpu?.available && gpu0 ? gpu0.name : (gpu?.error ?? 'nvidia-smi unavailable'),
                        color: 'text-blue-400',
                        icon: Activity,
                    },
                    {
                        label: 'VRAM Used',
                        val: gpu?.available && gpu0
                            ? `${(gpu0.memory_used_mb / 1024).toFixed(1)} GB`
                            : '—',
                        sub: gpu?.available && gpu0 ? `of ${(gpu0.memory_total_mb / 1024).toFixed(0)} GB` : '',
                        color: 'text-amber-400',
                        icon: Database,
                    },
                    {
                        label: 'Temperature',
                        val: gpu?.available && gpu0 ? `${gpu0.temperature_c}°C` : '—',
                        sub: gpu?.available && gpu0 ? `${gpu0.power_draw_w.toFixed(0)} W draw` : '',
                        color: gpu?.available && gpu0 && gpu0.temperature_c > 80 ? 'text-rose-400' : 'text-emerald-400',
                        icon: Zap,
                    },
                    {
                        label: 'Ollama Models',
                        val: ollama?.available ? String(ollama.model_count ?? 0) : '—',
                        sub: ollama?.available ? 'locally installed' : (ollama?.error ?? 'Ollama not running'),
                        color: 'text-indigo-400',
                        icon: Brain,
                    },
                ].map((s, i) => (
                    <div key={i} className="sota-card p-5">
                        <s.icon size={16} className={cn("mb-3", s.color)} />
                        <div className={cn("text-2xl font-bold font-outfit mb-1", s.color)}>{s.val}</div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{s.label}</div>
                        {s.sub && <div className="text-[10px] text-slate-600 mt-0.5 truncate">{s.sub}</div>}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* GPU sparkline */}
                <div className="lg:col-span-3 sota-card p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <Activity size={16} className="text-blue-400" />
                            <h3 className="font-bold font-outfit">GPU Live Chart</h3>
                        </div>
                        <div className="flex gap-4 text-[10px] font-bold text-slate-500">
                            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />GPU %</span>
                            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />VRAM %</span>
                        </div>
                    </div>

                    {!gpu?.available ? (
                        <div className="h-48 flex flex-col items-center justify-center text-slate-600 gap-2">
                            <AlertCircle size={24} className="opacity-30" />
                            <span className="text-xs">{gpu?.error ?? 'No GPU data — bridge running?'}</span>
                        </div>
                    ) : sparkline.length < 2 ? (
                        <div className="h-48 flex items-center justify-center text-slate-600 text-xs">
                            Collecting samples… ({sparkline.length}/{MAX_SPARKLINE})
                        </div>
                    ) : (
                        <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={sparkline}>
                                    <defs>
                                        <linearGradient id="gLoad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="gVram" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                                    <XAxis dataKey="t" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 9 }} interval="preserveStartEnd" />
                                    <Tooltip
                                        contentStyle={{ background: '#0a0a0f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', fontSize: '11px' }}
                                        formatter={(v: any, name: string) => [`${v}%`, name === 'load' ? 'GPU' : 'VRAM']}
                                    />
                                    <Area type="monotone" dataKey="load" stroke="#3b82f6" strokeWidth={2} fill="url(#gLoad)" dot={false} />
                                    <Area type="monotone" dataKey="vram" stroke="#f59e0b" strokeWidth={2} fill="url(#gVram)" dot={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {gpu?.available && gpu0 && (
                        <div className="mt-4 grid grid-cols-3 gap-4 text-[10px] pt-4 border-t border-white/5">
                            <div>
                                <div className="text-slate-500 font-bold uppercase tracking-wider">Driver</div>
                                <div className="text-slate-300 font-mono mt-0.5">{gpu0.driver_version}</div>
                            </div>
                            <div>
                                <div className="text-slate-500 font-bold uppercase tracking-wider">VRAM Free</div>
                                <div className="text-slate-300 font-mono mt-0.5">
                                    {((gpu0.memory_total_mb - gpu0.memory_used_mb) / 1024).toFixed(1)} GB
                                </div>
                            </div>
                            <div>
                                <div className="text-slate-500 font-bold uppercase tracking-wider">Power</div>
                                <div className="text-slate-300 font-mono mt-0.5">{gpu0.power_draw_w.toFixed(0)} W</div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Ollama model list */}
                <div className="lg:col-span-2 sota-card p-6 flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <Bot size={16} className="text-indigo-400" />
                            <h3 className="font-bold font-outfit">Ollama Models</h3>
                        </div>
                        <a
                            href="http://localhost:11434"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-500 hover:text-blue-400 transition-colors"
                        >
                            <ExternalLink size={13} />
                        </a>
                    </div>

                    {!ollama?.available ? (
                        <div className="flex flex-col items-center justify-center flex-1 gap-2 text-slate-600">
                            <AlertCircle size={20} className="opacity-30" />
                            <span className="text-xs text-center">{ollama?.error ?? 'Ollama not detected'}</span>
                            <code className="text-[10px] text-blue-400 mt-1">ollama serve</code>
                        </div>
                    ) : (
                        <>
                            {/* Running models */}
                            {running?.available && (running.models?.length ?? 0) > 0 && (
                                <div className="mb-4">
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-2">Currently loaded</div>
                                    {(running.models ?? []).map(m => (
                                        <div key={m.name} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-xs mb-1">
                                            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                                            <span className="font-mono text-slate-200 truncate">{m.name}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                                Installed ({ollama.model_count ?? 0})
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                                {(ollama.models ?? []).map(m => (
                                    <div key={m.name} className="p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-indigo-500/20 transition-all">
                                        <div className="font-bold text-slate-100 text-xs font-mono truncate">{m.name}</div>
                                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-500">
                                            {m.size_gb > 0 && <span>{m.size_gb} GB</span>}
                                            {m.parameter_size && <span>{m.parameter_size}</span>}
                                            {m.quantization && <span className="font-mono">{m.quantization}</span>}
                                            {m.family && <span className="capitalize">{m.family}</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* LM Studio note */}
            <div className="sota-card p-4 flex items-center gap-4 text-sm">
                <Bot size={16} className="text-slate-500 shrink-0" />
                <span className="text-slate-500">
                    LM Studio runs on <code className="text-blue-400">http://localhost:1234</code> (OpenAI-compatible API) —
                    models loaded there appear in the bridge's AI provider list at{' '}
                    <a href={bridgePath('/api/v1/ai/providers')} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                        /api/v1/ai/providers
                    </a>.
                </span>
            </div>
        </div>
    );
};

export default LocalAI;
