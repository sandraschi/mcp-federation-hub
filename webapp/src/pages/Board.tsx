import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
    MessageSquare, Inbox, RefreshCw, Send, Reply, Search, Shield
} from 'lucide-react';
import { federationApi } from '@/services/api';
import { cn } from '@/lib/utils';

interface Channel { id: number; name: string; description: string; }
interface BoardPost {
    id: number; channel: string; parent_id: number | null;
    author: string; title: string; body: string;
    created_at: string; updated_at: string;
}
interface InboxStatus { unread_by_entity: Record<string, number>; total_messages: number; }

export default function Board() {
    const [channels, setChannels] = useState<Channel[]>([]);
    const [activeChannel, setActiveChannel] = useState('dev-worklog');
    const [posts, setPosts] = useState<BoardPost[]>([]);
    const [loading, setLoading] = useState(false);
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [author, setAuthor] = useState('human');
    const [replyTo, setReplyTo] = useState<number | null>(null);
    const [inboxStatus, setInboxStatus] = useState<InboxStatus | null>(null);
    const [inboxEntity, setInboxEntity] = useState('fritz');
    const [inboxMsgs, setInboxMsgs] = useState<any[]>([]);
    const [search, setSearch] = useState('');

    const loadChannels = useCallback(async () => {
        try {
            const data = await federationApi.getBoardChannels();
            setChannels(data.channels || []);
        } catch { /* bridge down */ }
    }, []);

    const loadPosts = useCallback(async (channel: string) => {
        setLoading(true);
        try {
            const data = await federationApi.getBoardPosts(channel);
            setPosts(data.posts || []);
        } catch { setPosts([]); }
        setLoading(false);
    }, []);

    const loadInbox = useCallback(async () => {
        try { setInboxStatus(await federationApi.getInboxStatus()); } catch { /* down */ }
    }, []);

    useEffect(() => { loadChannels(); loadInbox(); }, [loadChannels, loadInbox]);
    useEffect(() => { loadPosts(activeChannel); }, [activeChannel, loadPosts]);

    const submitPost = async () => {
        if (!body.trim()) return;
        try {
            await federationApi.postBoardPost({
                channel: activeChannel, author: author || 'human',
                title, body, parent_id: replyTo ?? undefined,
            });
            setTitle(''); setBody(''); setReplyTo(null);
            loadPosts(activeChannel);
        } catch (e) { console.error('post failed', e); }
    };

    const pollInbox = async () => {
        try {
            const data = await federationApi.pollInbox(inboxEntity);
            setInboxMsgs(data.messages || []);
            loadInbox();
        } catch { setInboxMsgs([]); }
    };

    const searchPosts = async () => {
        if (!search.trim()) return loadPosts(activeChannel);
        try {
            const data = await federationApi.searchBoard(search);
            setPosts(data.posts || []);
        } catch { /* down */ }
    };

    return (
        <div className="space-y-6" data-testid="board-page">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-100">Fleet Board</h1>
                    <p className="text-sm text-zinc-500">Private bulletin board + agent inbox (P2 comm bus)</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5">
                        <Inbox className="h-3.5 w-3.5 text-amber-400" />
                        <span className="text-xs text-zinc-400">
                            unread: {inboxStatus ? Object.values(inboxStatus.unread_by_entity || {}).reduce((a, b) => a + b, 0) : '…'}
                        </span>
                    </div>
                    <button onClick={() => { loadChannels(); loadPosts(activeChannel); loadInbox(); }}
                        className="rounded-lg border border-zinc-800 p-2 text-zinc-400 hover:text-white">
                        <RefreshCw className="h-4 w-4" />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Board */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center gap-2 flex-wrap">
                        {channels.map((c) => (
                            <button key={c.id} onClick={() => setActiveChannel(c.name)}
                                className={cn('rounded-lg px-3 py-1.5 text-sm border transition-colors',
                                    activeChannel === c.name
                                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                                        : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200')}>
                                #{c.name}
                            </button>
                        ))}
                        <div className="ml-auto flex items-center gap-2">
                            <input value={search} onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && searchPosts()}
                                placeholder="search…" className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-sm text-zinc-200 outline-none w-36" />
                            <button onClick={searchPosts} className="rounded-lg border border-zinc-800 p-2 text-zinc-400 hover:text-white"><Search className="h-3.5 w-3.5" /></button>
                        </div>
                    </div>

                    {/* Composer */}
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
                        {replyTo && (
                            <div className="flex items-center justify-between rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
                                replying to post #{replyTo}
                                <button onClick={() => setReplyTo(null)} className="text-zinc-500 hover:text-white">✕</button>
                            </div>
                        )}
                        <div className="flex gap-3">
                            <input value={title} onChange={(e) => setTitle(e.target.value)}
                                placeholder="Title" className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 outline-none" />
                            <input value={author} onChange={(e) => setAuthor(e.target.value)}
                                placeholder="author" className="w-28 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 outline-none" />
                        </div>
                        <textarea value={body} onChange={(e) => setBody(e.target.value)}
                            rows={2} placeholder="Post body…"
                            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 outline-none resize-none" />
                        <div className="flex justify-end">
                            <button onClick={submitPost} disabled={!body.trim()}
                                className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-40">
                                <Send className="h-3.5 w-3.5" /> {replyTo ? 'Reply' : 'Post'}
                            </button>
                        </div>
                    </div>

                    {/* Posts */}
                    <div className="space-y-3">
                        {loading && <div className="text-sm text-zinc-500">Loading…</div>}
                        {!loading && posts.length === 0 && (
                            <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-600">
                                No posts in #{activeChannel}
                            </div>
                        )}
                        {posts.map((p) => (
                            <motion.div key={p.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                                className={cn('rounded-xl border p-4',
                                    p.parent_id ? 'ml-8 border-zinc-800/60 bg-zinc-900/20' : 'border-zinc-800 bg-zinc-900/40')}>
                                <div className="flex items-center gap-2 text-xs text-zinc-500">
                                    <span className="text-zinc-300">#{p.id}</span>
                                    {p.parent_id && <Reply className="h-3 w-3" />}
                                    <span className="font-medium text-amber-400/80">{p.author}</span>
                                    <span className="text-zinc-600">·</span>
                                    <span>{new Date(p.created_at).toLocaleString()}</span>
                                </div>
                                {p.title && <div className="mt-1.5 font-medium text-zinc-100">{p.title}</div>}
                                <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{p.body}</div>
                                <button onClick={() => { setReplyTo(p.id); }}
                                    className="mt-2 text-xs text-zinc-500 hover:text-amber-300">reply</button>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Inbox */}
                <div className="space-y-4">
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                        <div className="flex items-center justify-between">
                            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
                                <Inbox className="h-4 w-4 text-amber-400" /> Agent Inbox
                            </h2>
                            <Shield className="h-3.5 w-3.5 text-zinc-600" />
                        </div>
                        <div className="mt-3 flex gap-2">
                            <input value={inboxEntity} onChange={(e) => setInboxEntity(e.target.value)}
                                className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-sm text-zinc-200 outline-none" />
                            <button onClick={pollInbox} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700">
                                Poll
                            </button>
                        </div>
                        <div className="mt-3 space-y-2">
                            {inboxMsgs.length === 0 && <div className="text-xs text-zinc-600">No unread messages</div>}
                            {inboxMsgs.map((m) => (
                                <div key={m.id} className="rounded-lg border border-zinc-800/70 bg-zinc-950/50 p-3">
                                    <div className="text-xs text-zinc-500">{m.from_entity} → {m.to_entity}</div>
                                    <div className="text-sm font-medium text-zinc-200">{m.subject}</div>
                                    <div className="mt-0.5 text-xs text-zinc-400 line-clamp-3">{m.body}</div>
                                </div>
                            ))}
                        </div>
                        {inboxStatus && (
                            <div className="mt-3 border-t border-zinc-800 pt-2 text-xs text-zinc-500">
                                {Object.entries(inboxStatus.unread_by_entity || {}).map(([e, n]) => (
                                    <span key={e} className="mr-3"><span className="text-amber-400/80">{e}</span>: {n}</span>
                                ))}
                                <span>total: {inboxStatus.total_messages}</span>
                            </div>
                        )}
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/20 p-4 text-xs text-zinc-600">
                        <MessageSquare className="mb-2 h-4 w-4 text-zinc-500" />
                        Board is broadcast + archive; the inbox is addressed delivery only. FLEET_TOKEN gates everything when set.
                    </div>
                </div>
            </div>
        </div>
    );
}
