import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Wrench, Search, Play, Terminal, RefreshCw,
    ChevronRight, Code2, CheckCircle2, XCircle, Clock,
    AlertCircle, Server, Info
} from 'lucide-react';
import { federationApi } from '@/services/api';
import { cn } from '@/lib/utils';

interface Tool {
    name: string;
    description?: string;
    inputSchema?: {
        type?: string;
        properties?: Record<string, { type?: string; description?: string; default?: any }>;
        required?: string[];
    };
}

interface ToolResult {
    status: 'success' | 'error';
    data?: any;
    error?: string;
    ms?: number;
}

const Tools: React.FC = () => {
    const [servers, setServers] = useState<any[]>([]);
    const [selectedServer, setSelectedServer] = useState<string | null>(null);
    const [tools, setTools] = useState<Tool[]>([]);
    const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
    const [argsJson, setArgsJson] = useState('{}');
    const [argsError, setArgsError] = useState<string | null>(null);
    const [executing, setExecuting] = useState(false);
    const [result, setResult] = useState<ToolResult | null>(null);
    const [loadingTools, setLoadingTools] = useState(false);
    const [toolSearch, setToolSearch] = useState('');
    const [serverSearch, setServerSearch] = useState('');
    const [toolError, setToolError] = useState<string | null>(null);

    // Load server list
    useEffect(() => {
        federationApi.getServers().then(d => setServers(d.servers || [])).catch(() => {});
    }, []);

    // Load tools when server is selected
    const loadTools = useCallback(async (serverId: string, refresh = false) => {
        setLoadingTools(true);
        setToolError(null);
        setTools([]);
        setSelectedTool(null);
        setResult(null);
        try {
            const data = await federationApi.getServerTools(serverId, refresh);
            setTools(data.tools || []);
            if ((data.tools || []).length === 0 && !data.mcp_endpoint) {
                setToolError('No mcp_endpoint configured for this server.');
            } else if ((data.tools || []).length === 0) {
                setToolError('Server returned no tools (may be offline or not support tools/list).');
            }
        } catch (e: any) {
            setToolError('Failed to load tools: ' + (e.message || e));
        } finally {
            setLoadingTools(false);
        }
    }, []);

    const selectServer = (id: string) => {
        setSelectedServer(id);
        loadTools(id);
    };

    // When tool is selected, pre-fill args with schema defaults
    const selectTool = (tool: Tool) => {
        setSelectedTool(tool);
        setResult(null);
        const props = tool.inputSchema?.properties || {};
        const defaults: Record<string, any> = {};
        for (const [k, v] of Object.entries(props)) {
            if (v.default !== undefined) defaults[k] = v.default;
            else if (v.type === 'string') defaults[k] = '';
            else if (v.type === 'boolean') defaults[k] = false;
            else if (v.type === 'number' || v.type === 'integer') defaults[k] = 0;
            else defaults[k] = null;
        }
        setArgsJson(JSON.stringify(defaults, null, 2));
        setArgsError(null);
    };

    const validateArgs = (): Record<string, any> | null => {
        try {
            const parsed = JSON.parse(argsJson);
            setArgsError(null);
            return parsed;
        } catch (e: any) {
            setArgsError('Invalid JSON: ' + e.message);
            return null;
        }
    };

    const execute = async () => {
        if (!selectedServer || !selectedTool) return;
        const args = validateArgs();
        if (args === null) return;
        setExecuting(true);
        setResult(null);
        const t0 = Date.now();
        try {
            const data = await federationApi.callTool(selectedServer, selectedTool.name, args);
            setResult({ status: 'success', data, ms: Date.now() - t0 });
        } catch (e: any) {
            const msg = e.response?.data?.detail || e.message || 'Tool call failed';
            setResult({ status: 'error', error: msg, ms: Date.now() - t0 });
        } finally {
            setExecuting(false);
        }
    };

    const filteredServers = servers.filter(s =>
        !serverSearch ||
        s.name?.toLowerCase().includes(serverSearch.toLowerCase()) ||
        s.id?.toLowerCase().includes(serverSearch.toLowerCase())
    );

    const filteredTools = tools.filter(t =>
        !toolSearch ||
        t.name.toLowerCase().includes(toolSearch.toLowerCase()) ||
        t.description?.toLowerCase().includes(toolSearch.toLowerCase())
    );

    const required = selectedTool?.inputSchema?.required || [];
    const props = selectedTool?.inputSchema?.properties || {};

    return (
        <div className="h-[calc(100vh-140px)] flex flex-col gap-4 animate-in">
            <div>
                <h1 className="text-4xl font-outfit font-bold tracking-tight gradient-text">Tool Explorer</h1>
                <p className="text-slate-400 mt-1">Pick a server → discover its real tools via MCP → execute with live results.</p>
            </div>

            <div className="flex-1 flex gap-4 overflow-hidden min-h-0">
                {/* Server column */}
                <div className="w-52 flex flex-col gap-2 shrink-0">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                        <input
                            value={serverSearch}
                            onChange={e => setServerSearch(e.target.value)}
                            placeholder="Filter servers…"
                            className="w-full h-8 pl-8 pr-3 bg-white/[0.02] border border-white/5 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                        />
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                        {filteredServers.length === 0 ? (
                            <div className="text-slate-600 text-xs p-2">No servers — bridge running?</div>
                        ) : (
                            filteredServers.map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => selectServer(s.id)}
                                    className={cn(
                                        "w-full text-left px-3 py-2.5 rounded-xl text-xs transition-all border",
                                        selectedServer === s.id
                                            ? "bg-blue-500/10 border-blue-500/20 text-white"
                                            : "bg-white/[0.01] border-white/5 text-slate-400 hover:bg-white/[0.04]"
                                    )}
                                >
                                    <div className="font-bold truncate">{s.name || s.id}</div>
                                    <div className="text-slate-600 text-[9px] truncate mt-0.5">{s.category || ''}</div>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Tool column */}
                <div className="w-56 flex flex-col gap-2 shrink-0">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                        <input
                            value={toolSearch}
                            onChange={e => setToolSearch(e.target.value)}
                            placeholder="Filter tools…"
                            className="w-full h-8 pl-8 pr-3 bg-white/[0.02] border border-white/5 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                        />
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                        {!selectedServer ? (
                            <div className="text-slate-600 text-xs p-2">← Pick a server</div>
                        ) : loadingTools ? (
                            <div className="flex items-center gap-2 text-slate-500 text-xs p-2">
                                <RefreshCw size={12} className="animate-spin" /> Loading tools…
                            </div>
                        ) : toolError ? (
                            <div className="text-rose-400 text-xs p-2 flex items-start gap-1.5">
                                <AlertCircle size={12} className="mt-0.5 shrink-0" /> {toolError}
                            </div>
                        ) : filteredTools.length === 0 ? (
                            <div className="text-slate-600 text-xs p-2">No tools found</div>
                        ) : (
                            <>
                                <div className="text-[10px] text-slate-500 px-1 mb-1">{filteredTools.length} tools</div>
                                {filteredTools.map(t => (
                                    <button
                                        key={t.name}
                                        onClick={() => selectTool(t)}
                                        className={cn(
                                            "w-full text-left px-3 py-2.5 rounded-xl text-xs transition-all border",
                                            selectedTool?.name === t.name
                                                ? "bg-blue-500/10 border-blue-500/20 text-white"
                                                : "bg-white/[0.01] border-white/5 text-slate-400 hover:bg-white/[0.04]"
                                        )}
                                    >
                                        <div className="font-bold font-mono truncate">{t.name}</div>
                                        {t.description && (
                                            <div className="text-slate-500 text-[9px] truncate mt-0.5">{t.description}</div>
                                        )}
                                    </button>
                                ))}
                            </>
                        )}
                    </div>
                </div>

                {/* Execution area */}
                <div className="flex-1 flex flex-col gap-4 overflow-hidden min-h-0">
                    {!selectedTool ? (
                        <div className="flex-1 sota-card flex flex-col items-center justify-center text-center gap-4 text-slate-600">
                            <Wrench size={40} className="opacity-20" />
                            <span className="text-sm">Select a server and tool to start</span>
                        </div>
                    ) : (
                        <>
                            {/* Tool header + schema */}
                            <div className="sota-card p-5 shrink-0">
                                <div className="flex items-start justify-between gap-4 mb-4">
                                    <div>
                                        <h2 className="text-lg font-bold font-mono">{selectedTool.name}</h2>
                                        {selectedTool.description && (
                                            <p className="text-sm text-slate-400 mt-1">{selectedTool.description}</p>
                                        )}
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <button
                                            onClick={() => selectedServer && loadTools(selectedServer, true)}
                                            className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-all"
                                            title="Refresh tool list"
                                        >
                                            <RefreshCw size={14} />
                                        </button>
                                        <button
                                            onClick={execute}
                                            disabled={executing}
                                            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-500 text-white text-sm font-bold hover:bg-blue-600 transition-all disabled:opacity-50"
                                        >
                                            {executing ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
                                            Run
                                        </button>
                                    </div>
                                </div>

                                {/* Input schema summary */}
                                {Object.keys(props).length > 0 && (
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        {Object.entries(props).map(([k, v]) => (
                                            <span key={k} className={cn(
                                                "text-[10px] font-mono font-bold px-2 py-0.5 rounded border",
                                                required.includes(k)
                                                    ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                                                    : "bg-white/5 border-white/10 text-slate-400"
                                            )}>
                                                {k}: {v.type || '?'}{required.includes(k) ? '*' : ''}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Args editor */}
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                            Arguments (JSON)
                                        </label>
                                        {argsError && (
                                            <span className="text-[10px] text-rose-400 font-bold">{argsError}</span>
                                        )}
                                    </div>
                                    <textarea
                                        value={argsJson}
                                        onChange={e => { setArgsJson(e.target.value); setArgsError(null); }}
                                        className={cn(
                                            "w-full h-24 bg-black/40 rounded-xl p-3 font-mono text-xs border focus:outline-none focus:ring-1 resize-none",
                                            argsError
                                                ? "border-rose-500/40 focus:ring-rose-500/30 text-rose-400"
                                                : "border-white/5 focus:ring-blue-500/30 text-blue-400"
                                        )}
                                        spellCheck={false}
                                    />
                                </div>
                            </div>

                            {/* Output */}
                            <div className="sota-card flex-1 flex flex-col overflow-hidden bg-black/20">
                                <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 shrink-0">
                                    <div className="flex items-center gap-2">
                                        <Terminal size={14} className="text-slate-500" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Output</span>
                                    </div>
                                    {result && (
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-mono text-slate-500">{result.ms}ms</span>
                                            {result.status === 'success'
                                                ? <div className="flex items-center gap-1 text-emerald-400 text-[10px] font-bold"><CheckCircle2 size={12} /> OK</div>
                                                : <div className="flex items-center gap-1 text-rose-400 text-[10px] font-bold"><XCircle size={12} /> Error</div>
                                            }
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 font-mono text-xs">
                                    {executing ? (
                                        <div className="flex items-center gap-2 text-slate-500">
                                            <RefreshCw size={12} className="animate-spin" />
                                            Calling {selectedServer} → {selectedTool.name}…
                                        </div>
                                    ) : result ? (
                                        <pre className={cn(
                                            "whitespace-pre-wrap break-all leading-relaxed",
                                            result.status === 'error' ? 'text-rose-400' : 'text-blue-400/90'
                                        )}>
                                            {result.status === 'error'
                                                ? result.error
                                                : JSON.stringify(result.data, null, 2)
                                            }
                                        </pre>
                                    ) : (
                                        <div className="text-slate-700 flex flex-col items-center justify-center h-full gap-2">
                                            <Info size={24} className="opacity-20" />
                                            <span className="text-[10px] uppercase tracking-widest opacity-30">Press Run</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Tools;
