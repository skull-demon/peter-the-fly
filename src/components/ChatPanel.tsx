import { useEffect, useRef, useState, type RefObject } from "react";
import { SEED_CONVERSATION, askPeterOrScripted, newMessage, type Message } from "../data/flyBrain";
import { probeBrainAvailable } from "../brain/load";
import type { PeterTelemetry } from "../brain/talk";
import { ArrowIcon, EtchedFly } from "./Marks";

type Props = {
  active: boolean;
  onActivity: (busy: boolean) => void;
  portRef: RefObject<HTMLSpanElement | null>;
  /** live brain status from App (optional: falls back to a probe) */
  brainStatus?: "loading" | "live" | "fallback";
  /** fired after every real pipeline run so the scene can light up */
  onTelemetry?: (t: PeterTelemetry) => void;
};

const STORAGE_KEY = "flybrain-transcript-v2";

function initialTranscript(): Message[] {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(saved) && saved.length > 0 && saved.length <= 100 && saved.every((m) => m && (m.role === "you" || m.role === "fly") && typeof m.text === "string" && m.text.length <= 2000 && (m.note === undefined || typeof m.note === "string"))) {
      return saved.map((m) => newMessage(m.role, m.text, m.note));
    }
  } catch { /* Storage is optional in private browser contexts. */ }
  return SEED_CONVERSATION.map((m) => newMessage(m.role, m.text, m.note));
}

export default function ChatPanel({ active, onActivity, portRef, brainStatus = "loading", onTelemetry }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialTranscript);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamId, setStreamId] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [brainLive, setBrainLive] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const locked = useRef(false);
  const followTranscript = useRef(true);

  useEffect(() => () => {
    if (timeout.current) clearTimeout(timeout.current);
    if (interval.current) clearInterval(interval.current);
  }, []);

  useEffect(() => {
    if (busy || messages.length <= 4) return;
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-80))); } catch { /* Keep chat usable if storage is unavailable. */ }
  }, [messages, busy]);

  useEffect(() => {
    const el = scroller.current;
    if (el && followTranscript.current && (busy || messages.length > 4)) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 100)}px`;
  }, [draft]);

  useEffect(() => {
    setBrainLive(brainStatus === "live");
  }, [brainStatus]);

  useEffect(() => {
    let cancelled = false;
    probeBrainAvailable().then((ok) => {
      if (!cancelled) setBrainLive(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const transmit = (raw: string) => {
    const text = raw.trim();
    if (!text || locked.current) return;
    locked.current = true;
    followTranscript.current = true;
    setDraft("");
    setBusy(true);
    setConfirmReset(false);
    onActivity(true);
    setAnnouncement("The fly is considering your transmission.");
    const history = messages.filter((m) => m.role === "fly").map((m) => m.text);
    setMessages((previous) => [...previous, newMessage("you", text)]);
    // Real pipeline: the message stimulates the actual FlyWire subgraph, the
    // spiking simulation runs, and its state picks the words. The theatrical
    // 800 ms pause is kept for the apparatus aesthetics.
    timeout.current = setTimeout(async () => {
      const reply = await askPeterOrScripted(text, history);
      if (reply.real && reply.telemetry && onTelemetry) onTelemetry(reply.telemetry);
      const message = newMessage("fly", "", reply.note);
      setStreamId(message.id);
      setMessages((previous) => [...previous, message]);
      let characters = 0;
      interval.current = setInterval(() => {
        characters = Math.min(characters + 2, reply.text.length);
        setMessages((previous) => previous.map((m) => m.id === message.id ? { ...m, text: reply.text.slice(0, characters) } : m));
        if (characters === reply.text.length) {
          if (interval.current) clearInterval(interval.current);
          interval.current = null;
          setStreamId(null);
          setBusy(false);
          onActivity(false);
          locked.current = false;
          setAnnouncement(`FlyBrain says: ${reply.text}`);
        }
      }, 28);
    }, 800);
  };

  const reset = () => {
    if (busy) return;
    setMessages(SEED_CONVERSATION.map((m) => newMessage(m.role, m.text, m.note)));
    setConfirmReset(false);
    setAnnouncement("A fresh page has been placed in the apparatus.");
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* No storage is required. */ }
    if (scroller.current) scroller.current.scrollTop = 0;
    textarea.current?.focus();
  };

  return (
    <section className="chat-panel" aria-labelledby="chat-title">
      <header className="chat-heading">
        <div className="chat-kicker"><span className="eyebrow">THE LANGUAGE CHANNEL</span><span className="channel-index">01</span></div>
        <h2 id="chat-title">Ask the Fly<span>.</span></h2>
        <p>A local language model running through<br className="wide-break" /> a fly-inspired neural architecture.</p>
      </header>

      <div className="signal-channel">
        <span className="signal-socket" ref={portRef} aria-hidden="true"><span /></span>
        <span className="eyebrow">NEURAL SIGNAL <span className="signal-arrow">&#8594;</span> LANGUAGE</span>
        <svg className={`signal-wave ${active ? "wave-active" : ""}`} viewBox="0 0 76 20" fill="none" aria-hidden="true"><path d="M0 10h12l4-3 3 5 3-4 3 3 4-1h8l3-7 4 14 4-10 3 5 3-2h22" stroke="currentColor" strokeWidth=".9" /></svg>
      </div>

      <div className="transcript-heading">
        <span className="eyebrow">A CONVERSATION, IN PROGRESS</span>
        <button className="reset-transcript" onClick={() => setConfirmReset(!confirmReset)} disabled={busy} aria-label="Start a new conversation" title="New conversation">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5.2 5.5A6 6 0 1 1 4 11M3.5 2.5v4.2h4.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" /></svg>
        </button>
      </div>
      {confirmReset && <div className="reset-confirmation"><span>Begin on a fresh page?</span><button onClick={reset}>Begin again</button><button onClick={() => setConfirmReset(false)}>Keep this one</button></div>}

      <div
        className="transcript"
        ref={scroller}
        role="log"
        aria-label="Conversation with FlyBrain"
        aria-live="off"
        onScroll={() => {
          const el = scroller.current;
          if (el) followTranscript.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {messages.map((message, i) => (
          <article key={message.id} className={`message message-${message.role} ${message.id === streamId ? "message-streaming" : ""}`}>
            <div className="message-author">
              {message.role === "fly" ? <EtchedFly /> : <span className="author-tick" />}
              <span>{message.role === "fly" ? "FLYBRAIN" : "YOU"}</span>
              {message.role === "fly" && <span className="response-index">{String(Math.ceil((i + 1) / 2)).padStart(2, "0")}</span>}
            </div>
            {message.role === "you" ? <p className="user-query">{message.text}</p> : <>
              <blockquote className={message.id === streamId ? "stream-caret" : ""}>{message.text}</blockquote>
              {message.id !== streamId && message.note && <div className="response-note"><span />{message.note}</div>}
            </>}
          </article>
        ))}
        {busy && streamId === null && <div className="thinking-state"><EtchedFly /><span className="eyebrow">CONSULTING THE SPECIMEN<span className="thinking-dots">...</span></span></div>}
      </div>

      <div className="composer-section">
        {messages.length === 4 && !busy && <button className="suggested-query" onClick={() => transmit("Do you dream?")}><span>Curious where to begin?</span> Ask whether it dreams. <ArrowIcon /></button>}
        <form onSubmit={(event) => { event.preventDefault(); transmit(draft); }}>
          <label htmlFor="ask" className="sr-only">Your message to the fly</label>
          <div className={`composer ${busy ? "composer-busy" : ""}`}>
            <textarea
              ref={textarea}
              id="ask"
              rows={1}
              maxLength={1200}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); transmit(draft); }
              }}
              placeholder="Ask the fly something..."
            />
            <button type="submit" className="transmit-button" disabled={busy || !draft.trim()} aria-label={busy ? "Receiving transmission" : "Transmit message"}>
              <i className={`button-lamp ${busy ? "lit" : ""}`} />
              <span>{busy ? "RECEIVING" : "TRANSMIT"}</span><ArrowIcon />
            </button>
          </div>
          <div className="composer-meta">
            <span><i className={`status-dot ${active ? "working" : ""}`} />{active ? "NEURAL SIGNAL: TRANSLATING" : "NEURAL SIGNAL: STABLE"}</span>
            <span title={brainLive ? "FlyWire v783 connectome simulated locally in your browser" : "Brain bundle not found - scripted responses run locally"}>{brainLive ? "FLYWIRE v783 · IN-BROWSER" : "SCRIPTED FALLBACK · LOCAL"}</span>
          </div>
        </form>
        <p className="chat-postscript">Please be patient. It has a very small brain.</p>
      </div>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
    </section>
  );
}
