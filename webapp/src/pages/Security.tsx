import React, { useState, useEffect, useCallback } from 'react';
import {
    Shield, Lock, Fingerprint, Activity, Globe,
    RefreshCw, AlertCircle, CheckCircle2, Key, Link2,
    ExternalLink, Copy
} from 'lucide-react';
import { federationApi } from '@/services/api';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface PeerMe {
    public_url: string;
    invite_link: string;
    encrypted: boolean;
}

interface Peer {
    id: string;
    name: string;
    base_url: string;
    encrypted: boolean;
    status: string;
}

const Security: React.FC = () => {
    const [peerMe, setPeerMe] = useState<PeerMe | null>(null);
    const [peers, setPeers] = useState<Peer[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tokenSet, setTokenSet] = useState<boolean | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [meData, peersData] = await Promise.all([
                federationApi.getPeersMe(),
                federationApi.getPeers(),
            ]);
            setPeerMe(meData);
            setPeers(peersData.peers || []);

            // Infer whether PEER_TOKEN is set by checking invite_link has a non-empty token param
            try {
                const u = new URL(meData.invite_link);
                const tok = u.searchParams.get('token') ?? '';
                setTokenSet(tok.length > 0);
            } catch { setTokenSet(null); }
        } catch (e: any) {
            setError('Bridge unreachable: ' + e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, []);

    const copyToken = () => {
        if (!peerMe?.invite_link) return;
        try {
            const u = new URL(peerMe.invite_link);
            const tok = u.searchParams.get('token') ?? '';
            navigator.clipboard.writeText(tok);
            toast.success('Peer token copied');
        } catch { toast.error('Could not parse token'); }
    };

    const onlinePeers = peers.filter(p => p.status === 'online').length;
    const encryptedPeers = peers.filter(p => p.encrypted).length;

    return (
        <div className="space-y-8 animate-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-outfit font-bold tracking-tight gradient-text">Security</h1>
                    <p className="text-slate-400 mt-1">
                        Peer token status, mesh encryption, and active hub links.
                        Set <code className="text-blue-400">PEER_TOKEN</code> env var on the bridge to require auth for incoming peer calls.
                    </p>
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm font-bold hover:bg-white/10 transition-all disabled:opacity-50"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            {error && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                    <AlertCircle size={16} /> {error}
                </div>
            )}

            {/* Status cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    {
                        label: 'PEER_TOKEN',
                        val: loading ? '…' : tokenSet === null ? '?' : tokenSet ? 'Set ✓' : 'Not set',
                        color: tokenSet ? 'text-emerald-400' : 'text-amber-400',
                        icon: Key,
                        sub: tokenSet ? 'Incoming peer calls require auth' : 'Anyone can call /peers/invoke',
                    },
                    {
                        label: 'Hub Encryption',
                        val: loading ? '…' : peerMe?.encrypted ? 'HTTPS' : 'HTTP only',
                        color: peerMe?.encrypted ? 'text-emerald-400' : 'text-amber-400',
                        icon: Lock,
                        sub: peerMe?.encrypted ? 'Peer links are encrypted' : 'Set FEDERATION_PUBLIC_URL to https:// to enable',
                    },
                    {
                        label: 'Remote Peers',
                        val: loading ? '…' : peers.length,
                        color: 'text-blue-400',
                        icon: Link2,
                        sub: `${onlinePeers} online, ${encryptedPeers} encrypted`,
                    },
                    {
                        label: 'Bridge Auth',
                        val: loading ? '…' : 'Local only',
                        color: 'text-slate-400',
                        icon: Shield,
                        sub: 'No user auth — add reverse proxy for public exposure',
                    },
                ].map((s, i) => (
                    <div key={i} className="sota-card p-5">
                        <s.icon size={16} className={cn('mb-3', s.color)} />
                        <div className={cn('text-xl font-bold font-outfit mb-1', s.color)}>{s.val}</div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{s.label}</div>
                        <div className="text-[10px] text-slate-600 mt-0.5">{s.sub}</div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Invite link + token */}
                <div className="sota-card p-6">
                    <div className="flex items-center gap-3 mb-5">
                        <Fingerprint size={16} className="text-blue-400" />
                        <h3 className="font-bold text-slate-100">This hub's invite link</h3>
                    </div>

                    {loading ? (
                        <div className="text-slate-600 text-sm">Loading…</div>
                    ) : peerMe ? (
                        <div className="space-y-4">
                            <div>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Invite link</div>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 px-3 py-2 rounded-lg bg-black/30 text-blue-400 text-[11px] break-all">
                                        {peerMe.invite_link || '(no public URL configured)'}
                                    </code>
                                    <button
                                        onClick={() => { navigator.clipboard.writeText(peerMe.invite_link); toast.success('Copied'); }}
                                        className="p-2 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-all shrink-0"
                                    >
                                        <Copy size={14} />
                                    </button>
                                </div>
                            </div>

                            <div>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Peer token (Bearer)</div>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 px-3 py-2 rounded-lg bg-black/30 text-amber-400 text-[11px] font-mono">
                                        {tokenSet ? '••••••••••••••••••••••••••••••••' : '(not set — set PEER_TOKEN env var)'}
                                    </code>
                                    {tokenSet && (
                                        <button
                                            onClick={copyToken}
                                            className="p-2 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition-all shrink-0"
                                        >
                                            <Copy size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-2 pt-2">
                                {peerMe.encrypted
                                    ? <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400"><Lock size={11} /> Encrypted (HTTPS)</span>
                                    : <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-400"><AlertCircle size={11} /> Not encrypted — HTTP only</span>
                                }
                            </div>
                        </div>
                    ) : (
                        <div className="text-slate-600 text-sm">Could not load peer info — is the bridge running?</div>
                    )}
                </div>

                {/* Active peers */}
                <div className="sota-card p-6">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-3">
                            <Globe size={16} className="text-indigo-400" />
                            <h3 className="font-bold text-slate-100">Remote hub peers</h3>
                        </div>
                        <a href="#/peers" className="text-[10px] text-blue-400 hover:underline font-bold">Manage →</a>
                    </div>

                    {loading ? (
                        <div className="text-slate-600 text-sm">Loading…</div>
                    ) : peers.length === 0 ? (
                        <div className="text-slate-600 text-sm">
                            No remote peers configured. Go to the Peers page to add hubs.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {peers.map(p => (
                                <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                                    <div className={cn(
                                        'w-2 h-2 rounded-full shrink-0',
                                        p.status === 'online' ? 'bg-emerald-400' : 'bg-rose-500'
                                    )} />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-slate-200 truncate">{p.name}</div>
                                        <div className="text-[10px] text-slate-500 font-mono truncate">{p.base_url}</div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {p.encrypted && <Lock size={11} className="text-emerald-400" title="Encrypted (HTTPS)" />}
                                        <span className={cn(
                                            'text-[10px] font-bold uppercase',
                                            p.status === 'online' ? 'text-emerald-400' : 'text-slate-500'
                                        )}>
                                            {p.status}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Security notes */}
            <div className="sota-card p-5 space-y-3 text-[12px] text-slate-500">
                <div className="font-bold text-slate-400 text-sm mb-2">Security posture notes</div>
                <div className="flex gap-2"><CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-px" /><span>Bridge listens on <code className="text-slate-300">0.0.0.0:10857</code> — firewall this port if Goliath is network-accessible.</span></div>
                <div className="flex gap-2"><CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-px" /><span>Dashboard (<code className="text-slate-300">:10856</code>) is Vite dev server — not for production exposure. Use a reverse proxy with auth for that.</span></div>
                <div className="flex gap-2"><AlertCircle size={14} className="text-amber-400 shrink-0 mt-px" /><span>Peer invocation (<code className="text-slate-300">POST /api/v1/peers/invoke</code>) is unauthenticated unless <code className="text-slate-300">PEER_TOKEN</code> is set in bridge env.</span></div>
                <div className="flex gap-2"><AlertCircle size={14} className="text-amber-400 shrink-0 mt-px" /><span>Config save endpoint writes directly to <code className="text-slate-300">federation-config.json</code> — no access control beyond local network.</span></div>
                <div className="flex gap-2"><CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-px" /><span>Hub-to-hub links use HTTPS + Bearer tokens when configured — see Peers page for invite link setup.</span></div>
            </div>
        </div>
    );
};

export default Security;
