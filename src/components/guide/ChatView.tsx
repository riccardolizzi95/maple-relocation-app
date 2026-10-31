"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { ChatThread, ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import SlidePanel from "@/components/ui/SlidePanel";
import {
  Sparkles,
  Send,
  Paperclip,
  MessageSquare,
  Plus,
  Trash2,
  BookOpen,
  BookmarkPlus,
  Check,
  FileText,
  History,
  Globe,
  ShieldCheck,
  ShieldQuestion,
  ExternalLink,
  ChevronDown,
} from "lucide-react";

interface SourceMeta {
  id: string;
  name: string;
  trusted: boolean;
}

interface WebMeta {
  title: string;
  url: string;
}

interface MsgMeta {
  sources: SourceMeta[];
  web: WebMeta[];
  provider?: string;
}

type LocalMsg = ChatMessage & { meta?: MsgMeta };

interface KnowledgeSourceItem {
  id: string;
  name: string;
  type: string;
  trusted: boolean;
  owner_name: string | null;
  created_at: string;
  chunks: number;
}

interface Props {
  initialThreads: ChatThread[];
}

const SUGGESTED = [
  "Che documenti servono per lavorare appena arrivati?",
  "Documenti per aprire un conto in banca?",
  "Come funziona il primo/ultimo mese di affitto?",
];

export default function ChatView({ initialThreads }: Props) {
  const [threads, setThreads] = useState(initialThreads);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LocalMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [webSearch, setWebSearch] = useState(false);
  const [knowledgeCount, setKnowledgeCount] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // auto-scroll solo se l'utente è già in fondo: se scorre in su, lo lasciamo leggere
  const stickToBottomRef = useRef(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // client stabile: ricrearlo a ogni render faceva rilanciare loadMessages
  // in continuazione, cancellando i messaggi in streaming nei thread esistenti
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;

  const autosize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, []);

  // Scorrendo la chat il campo si comprime a una riga (il testo resta);
  // riprendendo a digitare torna alla dimensione piena
  const collapseComposer = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto"; // torna all'altezza di una riga
  }, []);

  const refreshKnowledgeCount = useCallback(async () => {
    try {
      const res = await fetch("/api/knowledge");
      const json = await res.json();
      if (res.ok) setKnowledgeCount(json.sources.length);
    } catch { /* silenzioso */ }
  }, []);

  // lo stato si aggiorna solo dopo l'await della fetch
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refreshKnowledgeCount(); }, [refreshKnowledgeCount]);

  const skipNextLoadRef = useRef(false);

  const loadMessages = useCallback(async (threadId: string) => {
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    setMessages(data ?? []);
  }, [supabase]);

  useEffect(() => {
    if (skipNextLoadRef.current) {
      // il thread è appena stato creato dallo streaming: i messaggi locali sono già giusti
      skipNextLoadRef.current = false;
      return;
    }
    // nuova chat: svuota subito; thread esistente: i messaggi arrivano dopo la query
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeThreadId) loadMessages(activeThreadId);
    else setMessages([]);
  }, [activeThreadId, loadMessages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottomRef.current) {
      // scroll diretto (niente smooth): durante lo streaming è fluido e
      // non strappa via lo scroll all'utente che sta rileggendo
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, sending]);

  const handleChatScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  async function handleSend(text?: string) {
    const q = (text ?? input).trim();
    if (!q || sending) return;
    setSending(true);
    setError("");
    setInput("");
    stickToBottomRef.current = true; // un nuovo invio segue sempre la risposta
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    // handleSend gira solo da eventi (invio/tap), mai durante il render
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const userMsg: LocalMsg = {
      id: `local-u-${now}`,
      thread_id: activeThreadId ?? "",
      role: "user",
      content: q,
      created_by: null,
      created_at: new Date().toISOString(),
    };
    const assistantMsg: LocalMsg = {
      id: `local-a-${now}`,
      thread_id: activeThreadId ?? "",
      role: "assistant",
      content: "",
      created_by: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    // Macchina da scrivere: il testo in arrivo si accumula in un buffer e viene
    // mostrato a velocità costante (~150 caratteri/s, accelera se il buffer cresce)
    let pending = "";
    let streamDone = false;
    let drainResolve!: () => void;
    const drainDone = new Promise<void>((r) => { drainResolve = r; });
    const typeTimer = setInterval(() => {
      if (pending.length === 0) {
        if (streamDone) { clearInterval(typeTimer); drainResolve(); }
        return;
      }
      const n = pending.length > 1200 ? 9 : 3;
      const chunk = pending.slice(0, n);
      pending = pending.slice(n);
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: m.content + chunk } : m))
      );
    }, 20);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId: activeThreadId, message: q, webSearch }),
      });

      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Errore sconosciuto");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let newThreadId: string | null = null;
      let newThreadTitle = "";
      let streamError = "";

      const applyDelta = (delta: string) => { pending += delta; };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const ev of events) {
          const line = ev.trim();
          if (!line.startsWith("data:")) continue;
          let obj;
          try { obj = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (obj.type === "meta") {
            newThreadId = obj.threadId;
            newThreadTitle = obj.threadTitle;
            if (webSearch && obj.webSearchAvailable === false) {
              setNotice("Ricerca web non configurata: manca TAVILY_API_KEY sul server");
              setTimeout(() => setNotice(""), 5000);
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id
                  ? { ...m, meta: { sources: obj.sources ?? [], web: obj.web ?? [] } }
                  : m
              )
            );
          } else if (obj.type === "delta") {
            applyDelta(obj.text);
          } else if (obj.type === "memory") {
            refreshKnowledgeCount();
            setNotice(`Memorizzato: ${obj.facts.join(" · ")}`);
            setTimeout(() => setNotice(""), 6000);
          } else if (obj.type === "provider") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id
                  ? { ...m, meta: { sources: m.meta?.sources ?? [], web: m.meta?.web ?? [], provider: obj.label } }
                  : m
              )
            );
          } else if (obj.type === "error") {
            streamError = obj.error;
          }
        }
      }

      if (streamError) throw new Error(streamError);

      // attende che il testo finisca di "scriversi" a schermo
      streamDone = true;
      await drainDone;

      if (!activeThreadId && newThreadId) {
        const newThread: ChatThread = {
          id: newThreadId,
          title: newThreadTitle,
          created_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setThreads((prev) => [newThread, ...prev]);
        skipNextLoadRef.current = true;
        setActiveThreadId(newThreadId);
        // i messaggi locali restano: al prossimo cambio thread si ricaricano dal DB
        setMessages((prev) =>
          prev.map((m) =>
            m.id === userMsg.id || m.id === assistantMsg.id
              ? { ...m, thread_id: newThreadId }
              : m
          )
        );
      } else if (activeThreadId) {
        setThreads((prev) => {
          const t = prev.find((x) => x.id === activeThreadId);
          if (!t) return prev;
          return [{ ...t, updated_at: new Date().toISOString() }, ...prev.filter((x) => x.id !== activeThreadId)];
        });
      }
      router.refresh();
    } catch (err) {
      clearInterval(typeTimer);
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id && m.id !== assistantMsg.id));
      setInput(q);
    } finally {
      setSending(false);
    }
  }

  async function handleTrustSource(sourceId: string) {
    try {
      const res = await fetch("/api/knowledge", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: sourceId, trusted: true }),
      });
      if (!res.ok) throw new Error();
      setMessages((prev) =>
        prev.map((m) =>
          m.meta
            ? {
                ...m,
                meta: {
                  ...m.meta,
                  sources: m.meta.sources.map((s) =>
                    s.id === sourceId ? { ...s, trusted: true } : s
                  ),
                },
              }
            : m
        )
      );
      setNotice("Fonte segnata come affidabile: verrà usata liberamente");
      setTimeout(() => setNotice(""), 3000);
    } catch {
      alert("Errore nel salvataggio");
    }
  }

  async function handleDeleteThread(id: string) {
    if (!confirm("Eliminare questa conversazione?")) return;
    setThreads((prev) => prev.filter((t) => t.id !== id));
    if (activeThreadId === id) setActiveThreadId(null);
    await supabase.from("chat_threads").delete().eq("id", id);
    router.refresh();
  }

  async function handleSaveToKnowledge(msg: LocalMsg) {
    const idx = messages.findIndex((m) => m.id === msg.id);
    const prevUser = [...messages.slice(0, idx)].reverse().find((m) => m.role === "user");
    const text = prevUser ? `Domanda: ${prevUser.content}\n\nRisposta: ${msg.content}` : msg.content;
    const name = activeThread?.title ?? "Dalla chat";

    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore");
      setSavedIds((prev) => new Set(prev).add(msg.id));
      refreshKnowledgeCount();
      setNotice("Salvato nella base di conoscenza");
      setTimeout(() => setNotice(""), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Errore");
    }
  }

  async function handleFileUpload(file: File) {
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/knowledge", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore upload");
      refreshKnowledgeCount();
      setNotice(`"${file.name}" aggiunto alla base di conoscenza (${json.chunks} blocchi). Segnalo come affidabile dal pannello Conoscenza.`);
      setTimeout(() => setNotice(""), 6000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore upload");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setThreadsOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50 transition-colors min-w-0"
        >
          <History className="h-4 w-4 shrink-0 text-gray-400" />
          <span className="truncate max-w-[35vw] sm:max-w-xs">
            {activeThread ? activeThread.title : "Conversazioni"}
          </span>
        </button>
        <button
          onClick={() => { setActiveThreadId(null); setError(""); }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50 transition-colors shrink-0"
          title="Nuova conversazione"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nuova</span>
        </button>
        <div className="ml-auto">
          <button
            onClick={() => setKnowledgeOpen(true)}
            className="relative inline-flex items-center gap-1.5 rounded-lg border border-maple-100 bg-maple-50 px-3 py-2 text-sm font-medium text-maple-600 shadow-sm hover:bg-maple-100 transition-colors shrink-0"
            title="Base di conoscenza"
          >
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Conoscenza</span>
            {knowledgeCount !== null && knowledgeCount > 0 && (
              <span className="rounded-full bg-maple-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                {knowledgeCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Messages */}
      <Card className="flex-1 min-h-0 py-0">
        <CardContent className="p-4 flex-1 min-h-0 flex flex-col">
          {messages.length === 0 && !sending ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-maple-50 text-maple-500">
                <Sparkles className="h-6 w-6" />
              </div>
              <p className="text-sm text-gray-400 max-w-sm">
                Chiedi qualsiasi cosa sul trasferimento. L&apos;assistente ricorda le conversazioni
                e usa i documenti che caricate come base di conoscenza condivisa.
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {SUGGESTED.map((sq) => (
                  <button
                    key={sq}
                    onClick={() => handleSend(sq)}
                    className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-500 shadow-sm hover:border-maple-300 hover:text-maple-600 transition-colors"
                  >
                    {sq}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div
              ref={scrollRef}
              className="flex-1 min-h-0 space-y-3 overflow-y-auto overscroll-contain"
              onScroll={handleChatScroll}
              onTouchMove={collapseComposer}
              onWheel={collapseComposer}
            >
              {messages.map((msg) => (
                <div key={msg.id} className={cn("flex items-end gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
                  {msg.role === "assistant" && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-maple-50 text-maple-500 mb-0.5">
                      <Sparkles className="h-3.5 w-3.5" />
                    </div>
                  )}
                  <div className={cn(
                    "max-w-[85%] break-words rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed",
                    msg.role === "user"
                      ? "bg-maple-500 text-white rounded-br-md shadow-sm"
                      : "bg-gray-100 text-gray-800 rounded-bl-md"
                  )}>
                    {msg.content || (
                      <span className="inline-flex gap-1 text-gray-400">
                        <span className="animate-bounce">·</span>
                        <span className="animate-bounce [animation-delay:120ms]">·</span>
                        <span className="animate-bounce [animation-delay:240ms]">·</span>
                      </span>
                    )}

                    {/* Fonti usate */}
                    {msg.role === "assistant" && msg.meta && (msg.meta.sources.length > 0 || msg.meta.web.length > 0) && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-gray-200/60 pt-1.5">
                        {msg.meta.sources.map((s) => (
                          <span
                            key={s.id}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                              s.trusted ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                            )}
                          >
                            {s.trusted ? <ShieldCheck className="h-3 w-3" /> : <ShieldQuestion className="h-3 w-3" />}
                            <span className="max-w-[140px] truncate">{s.name}</span>
                            {!s.trusted && (
                              <button
                                onClick={() => handleTrustSource(s.id)}
                                className="ml-0.5 rounded-full bg-amber-100 px-1.5 py-px font-semibold hover:bg-amber-200 transition-colors"
                                title="Segna questa fonte come affidabile"
                              >
                                Approva
                              </button>
                            )}
                          </span>
                        ))}
                        {msg.meta.web.map((w) => (
                          <a
                            key={w.url}
                            href={w.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                            title={w.url}
                          >
                            <Globe className="h-3 w-3" />
                            <span className="max-w-[140px] truncate">{w.title}</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        ))}
                      </div>
                    )}

                    {msg.role === "assistant" && msg.meta?.provider && (
                      <p className="mt-1 text-right text-[10px] text-gray-300">{msg.meta.provider}</p>
                    )}

                    {msg.role === "assistant" && msg.content && !msg.id.startsWith("local-a-") && (
                      <div className="mt-1.5 -mb-0.5">
                        {savedIds.has(msg.id) ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
                            <Check className="h-3 w-3" />
                            Salvato in conoscenza
                          </span>
                        ) : (
                          <button
                            onClick={() => handleSaveToKnowledge(msg)}
                            className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-maple-600 transition-colors"
                          >
                            <BookmarkPlus className="h-3 w-3" />
                            Salva in conoscenza
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notices */}
      {notice && (
        <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">{notice}</p>
      )}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}
      {uploading && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">Caricamento e indicizzazione documento...</p>
      )}

      {/* Composer stile Claude: testo a tutta larghezza, azioni nella riga sotto */}
      <div className="rounded-2xl border border-gray-200 bg-white p-2 shadow-sm focus-within:border-maple-300 focus-within:ring-2 focus-within:ring-maple-100 transition-colors">
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.txt,.md"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
        />
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); autosize(); }}
          onFocus={autosize}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={1}
          disabled={sending}
          placeholder={webSearch ? "Chiedi (con ricerca web)..." : "Scrivi un messaggio..."}
          className="w-full resize-none overflow-y-auto bg-transparent px-2 pt-1.5 pb-1 text-sm leading-relaxed text-gray-800 placeholder:text-gray-300 focus:outline-none disabled:opacity-60"
        />
        <div className="flex items-center gap-1 pt-0.5">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-maple-500 disabled:opacity-50 transition-colors"
            title="Carica documento nella base di conoscenza (.pdf, .txt, .md)"
          >
            <Plus className="h-5 w-5" />
          </button>
          <button
            onClick={() => setWebSearch((v) => !v)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors",
              webSearch
                ? "bg-blue-50 text-blue-600"
                : "text-gray-400 hover:bg-gray-100 hover:text-blue-500"
            )}
            title={webSearch ? "Ricerca web attiva" : "Attiva ricerca web"}
          >
            <Globe className="h-4 w-4" />
            {webSearch && <span>Web</span>}
          </button>
          <span className="flex-1" />
          <button
            onClick={() => handleSend()}
            disabled={sending || !input.trim()}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-maple-500 text-white shadow-sm hover:bg-maple-600 disabled:opacity-40 transition-colors"
            title="Invia"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Threads panel */}
      <SlidePanel open={threadsOpen} onClose={() => setThreadsOpen(false)} title="Conversazioni" size="full">
        <div className="space-y-1.5">
          <button
            onClick={() => { setActiveThreadId(null); setThreadsOpen(false); }}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-500 hover:border-maple-400 hover:text-maple-600 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nuova conversazione
          </button>
          {threads.length === 0 && (
            <p className="text-sm text-gray-300 italic py-4 text-center">Nessuna conversazione ancora.</p>
          )}
          {threads.map((t) => (
            <div
              key={t.id}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2.5 cursor-pointer transition-colors",
                t.id === activeThreadId ? "bg-maple-50" : "hover:bg-gray-50"
              )}
              onClick={() => { setActiveThreadId(t.id); setThreadsOpen(false); }}
            >
              <MessageSquare className={cn("h-4 w-4 shrink-0", t.id === activeThreadId ? "text-maple-500" : "text-gray-300")} />
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm truncate", t.id === activeThreadId ? "font-medium text-maple-700" : "text-gray-700")}>
                  {t.title}
                </p>
                <p className="text-[11px] text-gray-400">
                  {new Date(t.updated_at).toLocaleDateString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteThread(t.id); }}
                className="shrink-0 rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                title="Elimina"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </SlidePanel>

      {/* Knowledge base panel */}
      {knowledgeOpen && (
        <KnowledgePanel
          onClose={() => { setKnowledgeOpen(false); refreshKnowledgeCount(); }}
          onUpload={() => fileRef.current?.click()}
        />
      )}
    </>
  );
}

/* ─── Knowledge base panel ─── */

function KnowledgePanel({ onClose, onUpload }: { onClose: () => void; onUpload: () => void }) {
  const [sources, setSources] = useState<KnowledgeSourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<Record<string, { id: string; content: string }[]>>({});
  const [chunksLoading, setChunksLoading] = useState(false);

  useEffect(() => {
    fetch("/api/knowledge")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setSources(json.sources);
      })
      .catch(() => setError("Errore di caricamento"))
      .finally(() => setLoading(false));
  }, []);

  async function toggleExpand(sourceId: string) {
    if (expandedId === sourceId) { setExpandedId(null); return; }
    setExpandedId(sourceId);
    if (!chunks[sourceId]) {
      setChunksLoading(true);
      try {
        const res = await fetch(`/api/knowledge?id=${sourceId}`);
        const json = await res.json();
        if (res.ok) setChunks((prev) => ({ ...prev, [sourceId]: json.chunks }));
      } finally {
        setChunksLoading(false);
      }
    }
  }

  async function handleDeleteChunk(sourceId: string, chunkId: string) {
    if (!confirm("Eliminare questo ricordo?")) return;
    setChunks((prev) => ({ ...prev, [sourceId]: (prev[sourceId] ?? []).filter((c) => c.id !== chunkId) }));
    setSources((prev) => prev.map((s) => (s.id === sourceId ? { ...s, chunks: s.chunks - 1 } : s)));
    await fetch(`/api/knowledge?chunkId=${chunkId}`, { method: "DELETE" });
  }

  async function handleDelete(id: string) {
    if (!confirm("Eliminare questa fonte e tutti i suoi contenuti?")) return;
    setSources((prev) => prev.filter((s) => s.id !== id));
    await fetch(`/api/knowledge?id=${id}`, { method: "DELETE" });
  }

  async function handleToggleTrust(s: KnowledgeSourceItem) {
    const newVal = !s.trusted;
    setSources((prev) => prev.map((x) => (x.id === s.id ? { ...x, trusted: newVal } : x)));
    await fetch("/api/knowledge", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: s.id, trusted: newVal }),
    });
  }

  const TYPE_LABEL: Record<string, string> = {
    document: "Documento",
    conversation: "Dalla chat",
    manual: "Manuale",
  };

  const totalChunks = sources.reduce((sum, s) => sum + s.chunks, 0);
  const trustedCount = sources.filter((s) => s.trusted).length;

  return (
    <SlidePanel
      open
      onClose={onClose}
      title="Base di conoscenza"
      subtitle={sources.length > 0
        ? `${sources.length} fonti (${trustedCount} affidabili) · ${totalChunks} blocchi indicizzati · condivisa tra gli utenti`
        : "Condivisa tra tutti gli utenti"}
      size="full"
    >
      <div className="space-y-3">
        <button
          onClick={() => { onClose(); onUpload(); }}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-500 hover:border-maple-400 hover:text-maple-600 transition-colors"
        >
          <Paperclip className="h-4 w-4" />
          Carica documento (.pdf, .txt, .md)
        </button>

        {loading ? (
          <p className="text-sm text-gray-400 text-center py-4">Caricamento...</p>
        ) : error ? (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        ) : sources.length === 0 ? (
          <p className="text-sm text-gray-300 italic text-center py-4">
            Nessuna fonte ancora. Carica un documento o salva le risposte utili dalla chat.
          </p>
        ) : (
          <div className="space-y-1.5">
            {sources.map((s) => (
              <div key={s.id} className="rounded-lg bg-gray-50 overflow-hidden">
                <div
                  className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer"
                  onClick={() => toggleExpand(s.id)}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-maple-50 text-maple-500">
                    {s.type === "document" ? <FileText className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {s.name}
                      {s.owner_name && (
                        <span className="ml-1.5 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">
                          di {s.owner_name}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {TYPE_LABEL[s.type]} · {s.chunks} blocchi · {new Date(s.created_at).toLocaleDateString("it-IT")}
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleToggleTrust(s); }}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition-colors shrink-0",
                      s.trusted
                        ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                    )}
                    title={s.trusted ? "Fonte affidabile (clicca per revocare)" : "Da confermare (clicca per approvare)"}
                  >
                    {s.trusted ? <ShieldCheck className="h-3 w-3" /> : <ShieldQuestion className="h-3 w-3" />}
                    <span className="hidden sm:inline">{s.trusted ? "Affidabile" : "Da confermare"}</span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                    className="shrink-0 rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                    title="Elimina fonte"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <ChevronDown className={cn(
                    "h-4 w-4 shrink-0 text-gray-300 transition-transform",
                    expandedId === s.id && "rotate-180"
                  )} />
                </div>

                {/* Contenuto dei blocchi */}
                {expandedId === s.id && (
                  <div className="border-t border-gray-200/70 px-3 py-2 space-y-1.5 max-h-64 overflow-y-auto">
                    {chunksLoading && !chunks[s.id] ? (
                      <p className="text-xs text-gray-400 py-2">Caricamento contenuti...</p>
                    ) : (chunks[s.id] ?? []).length === 0 ? (
                      <p className="text-xs text-gray-300 italic py-2">Nessun contenuto.</p>
                    ) : (
                      (chunks[s.id] ?? []).map((c) => (
                        <div key={c.id} className="flex items-start gap-2 rounded-lg bg-white px-2.5 py-2 ring-1 ring-gray-100">
                          <p className="flex-1 min-w-0 text-xs text-gray-600 whitespace-pre-wrap line-clamp-4">
                            {c.content}
                          </p>
                          <button
                            onClick={() => handleDeleteChunk(s.id, c.id)}
                            className="shrink-0 rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                            title="Elimina questo ricordo"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </SlidePanel>
  );
}
