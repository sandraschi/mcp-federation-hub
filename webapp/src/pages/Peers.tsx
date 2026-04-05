import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Link2,
  Shield,
  Copy,
  Plus,
  Trash2,
  RefreshCw,
  Lock,
  Globe,
  Check,
  AlertCircle
} from 'lucide-react';
import { federationApi } from '@/services/api';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface PeerMe {
  public_url: string;
  invite_link: string;
  encrypted: boolean;
  message: string;
}

interface Peer {
  id: string;
  name: string;
  base_url: string;
  encrypted: boolean;
  status: 'online' | 'offline' | 'unhealthy' | 'unknown';
}

const Peers: React.FC = () => {
  const [me, setMe] = useState<PeerMe | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [addUrl, setAddUrl] = useState('');
  const [addName, setAddName] = useState('');
  const [addToken, setAddToken] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [meRes, peersRes] = await Promise.all([
        federationApi.getPeersMe(),
        federationApi.getPeers()
      ]);
      setMe(meRes);
      setPeers(peersRes.peers || []);
    } catch (e) {
      toast.error('Could not load peers. Is the bridge running?');
      setMe(null);
      setPeers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const copyInvite = () => {
    if (!me?.invite_link) return;
    navigator.clipboard.writeText(me.invite_link);
    toast.success('Invite link copied');
  };

  const parseInviteLink = (raw: string) => {
    const s = raw.trim();
    try {
      const u = new URL(s);
      const base = `${u.protocol}//${u.host}`;
      const token = u.searchParams.get('token') || '';
      return { baseUrl: base, token };
    } catch {
      return null;
    }
  };

  const addPeer = async () => {
    let url = addUrl.trim();
    const parsed = parseInviteLink(url);
    let tokenToUse = addToken.trim();
    if (parsed) {
      url = parsed.baseUrl;
      if (parsed.token) tokenToUse = tokenToUse || parsed.token;
    }
    let name = addName.trim();
    if (!name && url) {
      try { name = new URL(url).host; } catch { name = 'Peer'; }
    }
    if (!name) name = 'Peer';
    if (!url) {
      toast.error('Enter the remote hub URL or paste an invite link');
      return;
    }
    setAdding(true);
    try {
      await federationApi.addPeer(url, name, tokenToUse || undefined);
      toast.success('Peer added');
      setAddUrl('');
      setAddName('');
      setAddToken('');
      load();
    } catch (e: any) {
      const msg = e.response?.data?.detail || e.message || 'Failed to add peer';
      toast.error(msg);
    } finally {
      setAdding(false);
    }
  };

  const removePeer = async (peerId: string) => {
    try {
      await federationApi.removePeer(peerId);
      toast.success('Peer removed');
      load();
    } catch {
      toast.error('Failed to remove peer');
    }
  };

  if (loading && !me) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <RefreshCw className="w-8 h-8 text-slate-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-outfit font-bold tracking-tight gradient-text">Mesh Peers</h1>
          <p className="text-slate-400 mt-1">
            Connect to other hubs. Links use HTTPS for encrypted hub-to-hub traffic; share your invite link to let others add you.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-all"
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      {/* My invite link */}
      {me && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="sota-card p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <Link2 size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">Your invite link</h2>
              <p className="text-sm text-slate-500">Share this so another hub can add you as a peer (encrypted if you use HTTPS)</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <code className="flex-1 min-w-0 px-4 py-3 rounded-xl bg-black/30 text-slate-300 text-sm break-all">
              {me.invite_link}
            </code>
            <button
              onClick={copyInvite}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-all"
            >
              <Copy size={18} />
              Copy
            </button>
            {me.encrypted && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-bold">
                <Lock size={14} />
                Encrypted
              </span>
            )}
          </div>
        </motion.div>
      )}

      {/* Add peer */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="sota-card p-6"
      >
        <h2 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
          <Plus size={20} />
          Add remote hub
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          Use HTTPS for encrypted links (e.g. Tailscale URL or your public HTTPS endpoint).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="url"
            placeholder="https://friend-pc:10857 or https://friend.tail1234.ts.net:10857"
            value={addUrl}
            onChange={(e) => setAddUrl(e.target.value)}
            className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-200 placeholder:text-slate-600 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 outline-none"
          />
          <input
            type="text"
            placeholder="Display name (e.g. Steve's Hub)"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-200 placeholder:text-slate-600 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 outline-none"
          />
          <input
            type="password"
            placeholder="Peer token (from their invite link)"
            value={addToken}
            onChange={(e) => setAddToken(e.target.value)}
            className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-200 placeholder:text-slate-600 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 outline-none"
          />
        </div>
        <button
          onClick={addPeer}
          disabled={adding || !addUrl.trim()}
          className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500 text-white font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {adding ? <RefreshCw size={18} className="animate-spin" /> : <Plus size={18} />}
          Add peer
        </button>
      </motion.div>

      {/* List peers */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h2 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
          <Globe size={20} />
          Remote hubs ({peers.length})
        </h2>
        {peers.length === 0 ? (
          <div className="sota-card p-8 text-center text-slate-500">
            No remote hubs yet. Add one above or share your invite link so others can add you.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {peers.map((p) => (
              <div
                key={p.id}
                className="sota-card p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className={cn(
                    "p-2.5 rounded-xl shrink-0",
                    p.status === 'online' ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-500/10 text-slate-400"
                  )}>
                    {p.status === 'online' ? <Check size={20} /> : <AlertCircle size={20} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-100">{p.name}</span>
                      {p.encrypted && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-bold">
                          <Shield size={10} />
                          Encrypted
                        </span>
                      )}
                    </div>
                    <code className="text-xs text-slate-500 truncate block">{p.base_url}</code>
                    <span className={cn(
                      "text-xs font-bold uppercase",
                      p.status === 'online' ? "text-emerald-400" : "text-slate-500"
                    )}>
                      {p.status}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => removePeer(p.id)}
                  className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all shrink-0"
                  title="Remove peer"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default Peers;
