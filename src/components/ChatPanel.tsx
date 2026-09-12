import { useEffect, useRef, useState, type RefObject } from "react";
import { askPeterOrScripted, newMessage, type Message } from "../data/flyBrain";
import type { SimResult } from "../brain/sim";
import type { PeterTelemetry } from "../brain/talk";
import { ArrowIcon, EtchedFly } from "./Marks";
import { playBuzz } from "../utils/buzz";

type Props = {
  active: boolean;
  onActivity: (busy: boolean) => void;
  portRef: RefObject<HTMLSpanElement | null>;
  /** live brain status from App (optional: falls back to a probe) */
  brainStatus?: "loading" | "live" | "fallback";
  /** fired after every real pipeline run so the scene can light up */
  onTelemetry?: (t: PeterTelemetry) => void;
  /** fired with the raw simulation so the UI can draw the real spike raster */
  onSim?: (sim: SimResult) => void;
};

/**
 * The transcript starts EMPTY. There is no seed conversation and nothing is
 * persisted: every word Peter says is produced live by the spiking
 * simulation, and when you leave, it is gone — like real speech.
 */
export default function ChatPanel({ active, onActivity, portRef, brainStatus = "loading", onTelemetry, onSim }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamId, setStreamId] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const brainLive = brainStatus === "live";
  const scroller = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const locked = useRef(false);
  const followTranscript = useRef(true);
  const stopBuzz = useRef<(() => void) | null>(null);

  useEffect(() => () => {
    if (timeout.current) clearTimeout(timeout.current);
    if (interval.current) clearInterval(interval.current);
    stopBuzz.current?.();
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (el && followTranscript.current) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 100)}px`;
  }, [draft]);

  const transmit = (raw: string) => {
    const text = raw.trim();
    if (!text || locked.current) return;
    locked.current = true;
    followTranscript.current = true;
    setDraft("");
    setBusy(true);
    setConfirmReset(false);
    onActivity(true);
    setAnnouncement("Peter is considering your transmission.");
    setMessages((previous) => [...previous, newMessage("you", text)]);
    // Real pipeline only: the message stimulates the actual FlyWire subgraph,
    // the spiking simulation runs, and its state picks the words. The short
    // pause is purely theatrical; the simulation itself runs below.
    timeout.current = setTimeout(async () => {
      try {
        const reply = await askPeterOrScripted(text);
        if (reply.real && reply.telemetry && onTelemetry) onTelemetry(reply.telemetry);
        if (reply.real && reply.sim && onSim) onSim(reply.sim);
        // The buzz IS the simulation: it runs only while Peter speaks.
        if (reply.real) stopBuzz.current = playBuzz(active);
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
            stopBuzz.current?.();
            stopBuzz.current = null;
            setAnnouncement(`Peter says: ${reply.text}`);
          }
        }, 28);
      } catch {
        setMessages((previous) => [...previous, newMessage("fly", "Something jammed the apparatus. Please try again.", "PIPELINE ERROR · NO SIMULATION RAN")]);
        setBusy(false);
        onActivity(false);
        locked.current = false;
      }
    }, 800);
  };

  const reset = () => {
    if (busy) return;
    setMessages([]);
    setConfirmReset(false);
    setAnnouncement("A fresh page has been placed in the apparatus.");
    if (scroller.current) scroller.current.scrollTop = 0;
    textarea.current?.focus();
  };

  return (
    <section className="chat-panel" aria-labelledby="chat-title">
      <header className="chat-heading">
        <div className="chat-kicker"><span className="eyebrow">THE LANGUAGE CHANNEL</span><span className="channel-index">01</span></div>
        <h2 id="chat-title">Ask Peter<span>.</span></h2>
        <p>Every reply is computed by 2,200 real fly neurons<br className="wide-break" /> (FlyWire FAFB v783), spiking in your browser.</p>
      </header>

      <div className="signal-channel">
        <span className="signal-socket" ref={portRef} aria-hidden="true"><span /></span>
        <span className="eyebrow">NEURAL SIGNAL <span className="signal-arrow">&#8594;</span> LANGUAGE</span>
        <svg className={`signal-wave ${active ? "wave-active" : ""}`} viewBox="0 0 76 20" fill="none" aria-hidden="true"><path d="M0 10h12l4-3 3 5 3-4 3 3 4-1h8l3-7 4 14 4-10 3 5 3-2h22" stroke="currentColor" strokeWidth=".9" /></svg>
      </div>

      <div className="transcript-heading">
        <span className="eyebrow">{messages.length === 0 ? "NOTHING SPOKEN YET — ALL REPLIES ARE COMPUTED LIVE" : "A CONVERSATION, IN PROGRESS"}</span>
        <button className="reset-transcript" onClick={() => setConfirmReset(!confirmReset)} disabled={busy || messages.length === 0} aria-label="Clear the conversation" title="Clear the conversation">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5.2 5.5A6 6 0 1 1 4 11M3.5 2.5v4.2h4.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" /></svg>
        </button>
      </div>
      {confirmReset && <div className="reset-confirmation"><span>Clear the conversation?</span><button onClick={reset}>Clear</button><button onClick={() => setConfirmReset(false)}>Keep this one</button></div>}

      <div
        className={`transcript ${messages.length === 0 ? "transcript-empty" : ""}`}
        ref={scroller}
        role="log"
        aria-label="Conversation with Peter the Fly"
        aria-live="off"
        onScroll={() => {
          const el = scroller.current;
          if (el) followTranscript.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {messages.length === 0 && (
          <div className="transcript-empty-note">
            <EtchedFly />
            <p className="empty-line">The page is blank because nothing has been said yet.</p>
            <p className="empty-sub eyebrow">SAY HELLO — PETER'S NEURONS WILL DO THE REST</p>
          </div>
        )}
        {messages.map((message, i) => (
          <article key={message.id} className={`message message-${message.role} ${message.id === streamId ? "message-streaming" : ""}`}>
            <div className="message-author">
              {message.role === "fly" ? <EtchedFly /> : <span className="author-tick" />}
              <span>{message.role === "fly" ? "PETER" : "YOU"}</span>
              {message.role === "fly" && <span className="response-index">{String(Math.ceil((i + 1) / 2)).padStart(2, "0")}</span>}
            </div>
            {message.role === "you" ? <p className="user-query">{message.text}</p> : <>
              <blockquote className={message.id === streamId ? "stream-caret" : ""}>{message.text}</blockquote>
              {message.id !== streamId && message.note && <div className="response-note"><span />{message.note}</div>}
            </>}
          </article>
        ))}
        {busy && streamId === null && <div className="thinking-state"><EtchedFly /><span className="eyebrow">SIMULATING 2,200 NEURONS<span className="thinking-dots">...</span></span></div>}
      </div>

      <div className="composer-section">
        {messages.length === 0 && !busy && <button className="suggested-query" onClick={() => transmit("hello peter")}><span>Curious where to begin?</span> Say hello to Peter. <ArrowIcon /></button>}
        <form onSubmit={(event) => { event.preventDefault(); transmit(draft); }}>
          <label htmlFor="ask" className="sr-only">Your message to Peter</label>
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
              placeholder="Ask Peter something..."
            />
            <button type="submit" className="transmit-button" disabled={busy || !draft.trim()} aria-label={busy ? "Receiving transmission" : "Transmit message"}>
              <i className={`button-lamp ${busy ? "lit" : ""}`} />
              <span>{busy ? "RECEIVING" : "TRANSMIT"}</span><ArrowIcon />
            </button>
          </div>
          <div className="composer-meta">
            <span><i className={`status-dot ${active ? "working" : ""}`} />{active ? "NEURAL SIGNAL: TRANSLATING" : "NEURAL SIGNAL: STABLE"}</span>
            <span title={brainLive ? "FlyWire FAFB v783 connectome (2,200-neuron visual-pathway subnetwork) simulated locally in your browser" : "Brain bundle not found - Peter cannot answer until it is rebuilt"}>{brainLive ? "FLYWIRE v783 · LIVE" : brainStatus === "loading" ? "CONNECTOME LOADING" : "CONNECTOME OFFLINE"}</span>
          </div>
        </form>
        <p className="chat-postscript">Please be patient. It has a very small brain.</p>
      </div>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
    </section>
  );
}
