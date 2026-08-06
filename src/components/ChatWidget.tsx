import { useEffect, useRef, useState } from "react";

import { IS_WEDDINGS_SITE } from "@/lib/siteMode";

type Msg = { role: "user" | "assistant"; content: string };

const GOLD = "#c9a96a";

/*
 * The standalone Weddings deploy runs this same component, so everything the
 * visitor sees is branded from the build's site mode. The server applies the
 * matching framing to the system prompt (server/jvoKnowledge.js).
 */
const ASSISTANT_NAME = IS_WEDDINGS_SITE ? "JVO Weddings Assistant" : "JVO Events Assistant";
const LAUNCHER_LABEL = IS_WEDDINGS_SITE ? "Chat with JVO Weddings" : "Chat with JVO Events";
const HEADER_SUBTITLE = IS_WEDDINGS_SITE
  ? "Ask about packages, pricing, tours & booking"
  : "Ask about pricing, weddings, tours & booking";
const GREETING = IS_WEDDINGS_SITE
  ? "Hi! I'm the JVO Weddings assistant. Ask me about our wedding packages, enhancements, pricing, tours, or booking your date. How can I help?"
  : "Hi! I'm the JVO Events assistant. Ask me about pricing, weddings, what we host, tours, or booking your event. How can I help?";

/**
 * Floating customer chatbot. A gold launcher in the bottom-right opens a dark,
 * on-brand chat panel that talks to POST /api/chat (answers from the JVO
 * capability overview). Self-contained — no external chat library.
 */
export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: GREETING }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the transcript pinned to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Skip the canned greeting; send only the real conversation.
        body: JSON.stringify({ messages: next.filter((m, i) => !(i === 0 && m.role === "assistant")) }),
      });
      const data = await res.json().catch(() => ({}));
      const reply =
        data.reply ||
        "Sorry — I'm having trouble right now. Please email eventsjvo@gmail.com or call 678-519-4723.";
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            "I couldn't reach our assistant. Please email eventsjvo@gmail.com or call 678-519-4723 and we'll help you directly.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Launcher */}
      <button
        type="button"
        aria-label={open ? "Close chat" : LAUNCHER_LABEL}
        onClick={() => setOpen((v) => !v)}
        className="fixed z-[60] flex items-center justify-center transition-transform hover:scale-105"
        style={{
          right: 20,
          bottom: 20,
          width: 58,
          height: 58,
          borderRadius: "50%",
          background: GOLD,
          color: "#0b0b0b",
          boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
          border: "none",
          cursor: "pointer",
        }}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.7 8.7 0 0 1-3.9-.9L3 20l1.4-4.1A8.4 8.4 0 0 1 3.5 11.5 8.38 8.38 0 0 1 12 3a8.38 8.38 0 0 1 9 8.5z" />
          </svg>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed z-[60] flex flex-col overflow-hidden"
          role="dialog"
          aria-label={IS_WEDDINGS_SITE ? "JVO Weddings chat" : "JVO Events chat"}
          style={{
            right: 20,
            bottom: 90,
            width: "min(380px, calc(100vw - 40px))",
            height: "min(560px, calc(100vh - 130px))",
            background: "#0b0b0b",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
            boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.02)" }}
          >
            <span
              className="grid place-items-center shrink-0"
              style={{ width: 34, height: 34, borderRadius: "50%", background: GOLD, color: "#0b0b0b", fontWeight: 700, fontFamily: "'Playfair Display', serif" }}
            >
              J
            </span>
            <div>
              <div className="text-white text-sm font-bold leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
                {ASSISTANT_NAME}
              </div>
              <div className="text-white/40 text-[0.7rem]" style={{ fontFamily: "'Lato', sans-serif" }}>
                {HEADER_SUBTITLE}
              </div>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ background: "#080808" }}>
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className="text-sm leading-relaxed"
                  style={{
                    maxWidth: "82%",
                    whiteSpace: "pre-wrap",
                    padding: "0.6rem 0.8rem",
                    borderRadius: 10,
                    fontFamily: "'Lato', sans-serif",
                    background: m.role === "user" ? GOLD : "rgba(255,255,255,0.06)",
                    color: m.role === "user" ? "#0b0b0b" : "rgba(255,255,255,0.9)",
                    border: m.role === "user" ? "none" : "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div
                  className="text-sm"
                  style={{ padding: "0.6rem 0.8rem", borderRadius: 10, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", fontFamily: "'Lato', sans-serif" }}
                >
                  <span className="chat-typing">Typing…</span>
                </div>
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="flex items-center gap-2 px-3 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.10)", background: "#0b0b0b" }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Type your question…"
              className="flex-1 text-sm outline-none"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                padding: "0.6rem 0.75rem",
                color: "#fff",
                fontFamily: "'Lato', sans-serif",
              }}
            />
            <button
              type="button"
              onClick={send}
              disabled={loading || !input.trim()}
              aria-label="Send message"
              className="grid place-items-center shrink-0 transition-opacity"
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: GOLD,
                color: "#0b0b0b",
                border: "none",
                cursor: loading || !input.trim() ? "default" : "pointer",
                opacity: loading || !input.trim() ? 0.5 : 1,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
