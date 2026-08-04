'use client';

import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'hush-session';

function formatTime(value) {
  return new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatJoined(value) {
  const diff = Date.now() - value;

  if (diff < 60 * 1000) {
    return 'just now';
  }

  const minutes = Math.floor(diff / 60000);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  return `${hours}h ago`;
}

function initials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function mergeMessages(existing, incoming) {
  const merged = new Map();

  for (const message of [...existing, ...incoming]) {
    merged.set(message.id, message);
  }

  return Array.from(merged.values()).sort((left, right) => left.createdAt - right.createdAt);
}

export default function Home() {
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [messageText, setMessageText] = useState('');
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [lobby, setLobby] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('Create a temporary room or join one with a 6-digit code.');
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef(null);
  const sessionRef = useRef(null);
  const sinceRef = useRef(0);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored);

      if (parsed?.code && parsed?.member?.id) {
        setSession(parsed);
        setName(parsed.member.name ?? '');
        setJoinCode(parsed.code ?? '');
        setNotice(`Reconnected to lobby ${parsed.code}.`);
        sinceRef.current = parsed.member.joinedAt ?? Date.now();
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    let active = true;
    sinceRef.current = session.member.joinedAt;

    const syncMessages = async () => {
      const current = sessionRef.current;

      if (!current) {
        return;
      }

      try {
        const response = await fetch(`/api/messages?code=${current.code}&since=${sinceRef.current}`, {
          cache: 'no-store',
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || 'Could not load messages');
        }

        if (!active) {
          return;
        }

        if (payload.lobby) {
          setLobby(payload.lobby);
        }

        if (payload.messages?.length) {
          setMessages((currentMessages) => mergeMessages(currentMessages, payload.messages));
          sinceRef.current = Math.max(
            sinceRef.current,
            payload.messages[payload.messages.length - 1].createdAt,
          );
        }
      } catch (syncError) {
        if (!active) {
          return;
        }

        setError(syncError.message);
      }
    };

    syncMessages();
    const timer = setInterval(syncMessages, 2500);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [session]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!copied) {
      return undefined;
    }

    const timer = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(timer);
  }, [copied]);

  async function activateSession(payload) {
    const nextSession = {
      code: payload.code,
      member: payload.member,
    };

    setSession(nextSession);
    setLobby(payload.lobby ?? null);
    setMessages(payload.messages ?? []);
    setMessageText('');
    setError('');
    setNotice(`Joined lobby ${payload.code}. Only messages from after you joined are visible.`);
    sinceRef.current = payload.member.joinedAt;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
  }

  async function createLobby(event) {
    event.preventDefault();

    if (!name.trim()) {
      setError('Enter your name first.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Could not create lobby');
      }

      setJoinCode(payload.code);
      await activateSession(payload);
    } catch (createError) {
      setError(createError.message);
    } finally {
      setLoading(false);
    }
  }

  async function joinExistingLobby(event) {
    event.preventDefault();

    if (!joinCode.trim() || joinCode.trim().length !== 6) {
      setError('Enter a valid 6-digit code.');
      return;
    }

    if (!name.trim()) {
      setError('Enter your name first.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: joinCode.trim(), name }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Could not join lobby');
      }

      await activateSession(payload);
    } catch (joinError) {
      setError(joinError.message);
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();

    if (!session) {
      return;
    }

    const text = messageText.trim();

    if (!text) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: session.code,
          memberId: session.member.id,
          text,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Could not send message');
      }

      if (payload.lobby) {
        setLobby(payload.lobby);
      }

      if (payload.message) {
        setMessages((currentMessages) => mergeMessages(currentMessages, [payload.message]));
        sinceRef.current = Math.max(sinceRef.current, payload.message.createdAt);
      }

      setMessageText('');
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setLoading(false);
    }
  }

  function copyCode() {
    if (!session?.code) {
      return;
    }

    navigator.clipboard.writeText(session.code).then(() => setCopied(true));
  }

  async function leaveLobby() {
    const currentSession = sessionRef.current;

    if (currentSession) {
      try {
        const response = await fetch('/api/leave', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: currentSession.code,
            memberId: currentSession.member.id,
          }),
        });

        const payload = await response.json();

        if (response.ok && payload.lobby) {
          setLobby(payload.lobby);
        }
      } catch {
        setError('Could not leave the lobby cleanly. Your local session was still cleared.');
      }
    }

    window.localStorage.removeItem(STORAGE_KEY);
    setSession(null);
    setMessages([]);
    setLobby(null);
    setMessageText('');
    setNotice('You left this lobby on this device. Rejoin with the same 6-digit code if it is still active.');
  }

  const memberCount = lobby?.memberCount ?? (session ? 1 : 0);
  const maxMembers = lobby?.maxMembers ?? 8;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">H</span>
          <div>
            <p className="eyebrow">Temporary room chat</p>
            <h1>Hush</h1>
          </div>
        </div>
        <div className="topbar-badges">
          <span className="hero-pill">Blue / ash theme</span>
          <span className="hero-pill">No chat history</span>
          <span className="hero-pill">8-person room cap</span>
        </div>
      </header>

      <section className="hero hero-reworked">
        <div className="hero-copy-block hero-copy-block-expanded">
          <div className="hero-copy-head">
            <p className="eyebrow">Private, temporary, clean</p>
            <h2>Chat that fades with the room.</h2>
          </div>
          <p className="hero-copy hero-copy-strong">
            Hush is built for small, temporary conversations. New members only see messages sent after they enter, and the room stays limited to 8 people.
          </p>
          <div className="hero-actions hero-actions-grid">
            <span className="hero-pill">Start instantly</span>
            <span className="hero-pill">Join with 6 digits</span>
            <span className="hero-pill">No old messages</span>
            <span className="hero-pill">Works on mobile</span>
          </div>
        </div>

        <aside className="hero-card hero-card-expanded">
          <div className="hero-card-top hero-card-top-strong">
            <span className="hero-kicker">Live room pulse</span>
            <span className="hero-stat hero-count">{session ? `${memberCount}/${maxMembers}` : '0/8'}</span>
            <span className="hero-subtext">{session ? 'Members currently inside the room' : 'Create or join a lobby to begin'}</span>
          </div>

          <div className="hero-card-grid hero-card-grid-strong">
            <div>
              <span className="hero-label">Status</span>
              <span className="hero-value">{session ? 'Active' : 'Idle'}</span>
            </div>
            <div>
              <span className="hero-label">Joined</span>
              <span className="hero-value">{session ? formatJoined(session.member.joinedAt) : '—'}</span>
            </div>
            <div>
              <span className="hero-label">Room code</span>
              <span className="hero-value hero-code">{session ? session.code : '------'}</span>
            </div>
            <div>
              <span className="hero-label">Visibility</span>
              <span className="hero-value">Join-time only</span>
            </div>
          </div>
        </aside>
      </section>

      <section className="dashboard-grid">
        <div className="controls-stack">
          <form className="panel panel-accent" onSubmit={createLobby}>
            <div className="panel-head">
              <p className="panel-kicker">Create lobby</p>
              <h2>Start a new room</h2>
            </div>
            <label className="field">
              <span>Name</span>
              <input
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                autoComplete="nickname"
              />
            </label>
            <button className="button primary" type="submit" disabled={loading}>
              Create lobby
            </button>
          </form>

          <form className="panel panel-muted" onSubmit={joinExistingLobby}>
            <div className="panel-head">
              <p className="panel-kicker">Join lobby</p>
              <h2>Enter the 6-digit code</h2>
            </div>
            <label className="field">
              <span>Code</span>
              <input
                className="input code-input"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </label>
            <label className="field">
              <span>Name</span>
              <input
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                autoComplete="nickname"
              />
            </label>
            <button className="button secondary" type="submit" disabled={loading}>
              Join lobby
            </button>
          </form>
        </div>

        <section className="panel chat-panel chat-panel-shell">
          <div className="chat-topbar chat-topbar-shell">
            <div>
              <p className="panel-kicker">Active room</p>
              <h2>{session ? `Lobby ${session.code}` : 'No lobby joined yet'}</h2>
              <p className="muted">{notice}</p>
            </div>
            {session ? (
              <div className="room-actions">
                <button className="button ghost small" type="button" onClick={copyCode}>
                  {copied ? 'Copied' : 'Copy code'}
                </button>
                <button className="button ghost small" type="button" onClick={leaveLobby}>
                  Leave
                </button>
              </div>
            ) : null}
          </div>

          <div className="message-list message-list-shell">
            {!session ? (
              <div className="empty-state">
                <h3>Join or create a room to start chatting.</h3>
                <p>Every member only sees messages created after their join time.</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="empty-state">
                <h3>No messages yet.</h3>
                <p>Send the first one. Older history stays hidden from new members.</p>
              </div>
            ) : (
              messages.map((message) => {
                const mine = message.memberId === session.member.id;

                return (
                  <article key={message.id} className={`message ${mine ? 'mine' : ''}`}>
                    <div className="avatar">{initials(message.memberName)}</div>
                    <div className="message-body">
                      <div className="message-meta">
                        <strong>{mine ? 'You' : message.memberName}</strong>
                        <span>{formatTime(message.createdAt)}</span>
                      </div>
                      <p className="bubble">{message.text}</p>
                    </div>
                  </article>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          <form className="composer composer-shell" onSubmit={sendMessage}>
            <input
              className="input composer-input"
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              placeholder={session ? 'Write a message...' : 'Join a lobby first'}
              disabled={!session}
            />
            <button className="button primary" type="submit" disabled={!session || loading}>
              Send
            </button>
          </form>
        </section>
      </section>

      <p className={`status status-bar ${error ? 'error' : ''}`} aria-live="polite">
        {error || `Up to ${maxMembers} people per room. Messages stay hidden until a member joins.`}
      </p>

      <style jsx global>{`
        .app-shell {
          position: relative;
          z-index: 1;
          width: min(1200px, calc(100% - 24px));
          margin: 0 auto;
          padding: 28px 0 48px;
          display: grid;
          gap: 18px;
          font-family: var(--font-body), Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }

        .topbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          padding: 6px 4px 0;
        }

        .brand-lockup {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .brand-mark {
          width: 54px;
          height: 54px;
          border-radius: 18px;
          display: grid;
          place-items: center;
          background: linear-gradient(135deg, #60a5fa 0%, #38bdf8 55%, #93c5fd 100%);
          color: #07111f;
          font-weight: 900;
          font-size: 1.25rem;
          box-shadow: 0 16px 34px rgba(96, 165, 250, 0.2);
        }

        .brand-lockup h1 {
          font-size: clamp(2rem, 4vw, 3.4rem);
          letter-spacing: -0.08em;
          line-height: 0.95;
          margin: 0;
        }

        .topbar-badges,
        .hero-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .hero-pill {
          padding: 10px 14px;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(15, 23, 42, 0.72);
          color: #f8fafc;
          font-size: 0.9rem;
          backdrop-filter: blur(12px);
        }

        .hero-reworked {
          display: grid;
          grid-template-columns: minmax(0, 1.5fr) minmax(300px, 0.92fr);
          gap: 18px;
          align-items: stretch;
        }

        .hero-copy-block,
        .hero-card,
        .panel {
          border: 1px solid rgba(148, 163, 184, 0.15);
          border-radius: 28px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.09), rgba(148, 163, 184, 0.05)), rgba(16, 24, 40, 0.78);
          backdrop-filter: blur(18px) saturate(130%);
          box-shadow: 0 34px 90px rgba(2, 6, 23, 0.34);
        }

        .hero-copy-block {
          padding: clamp(22px, 3vw, 36px);
          display: grid;
          align-content: center;
          gap: 16px;
        }

        .hero-copy-head {
          display: grid;
          gap: 10px;
        }

        .hero-copy-head h2 {
          font-size: clamp(1.9rem, 4vw, 3.4rem);
          line-height: 0.98;
          letter-spacing: -0.08em;
          max-width: 12ch;
          margin: 0;
        }

        .hero-copy-strong {
          max-width: 54ch;
        }

        .hero-actions-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .hero-card {
          padding: clamp(18px, 2.6vw, 28px);
          display: grid;
          gap: 18px;
          background: linear-gradient(160deg, rgba(96, 165, 250, 0.16), rgba(148, 163, 184, 0.04)), rgba(16, 24, 40, 0.78);
        }

        .hero-card-top,
        .hero-card-grid,
        .controls-stack,
        .chat-panel,
        .chat-panel-shell,
        .message-body,
        .field,
        .panel-head,
        .hero-copy-head {
          display: grid;
        }

        .hero-card-top {
          gap: 6px;
          padding-bottom: 10px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.1);
        }

        .hero-count {
          font-size: clamp(2.4rem, 6vw, 4.4rem);
          letter-spacing: -0.08em;
          line-height: 1;
        }

        .hero-subtext,
        .muted,
        .status {
          color: #cbd5e1;
          line-height: 1.6;
        }

        .hero-card-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .hero-card-grid > div {
          padding: 14px;
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(148, 163, 184, 0.045));
          border: 1px solid rgba(148, 163, 184, 0.11);
          display: grid;
          gap: 6px;
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: minmax(280px, 0.72fr) minmax(0, 1.28fr);
          gap: 18px;
          align-items: start;
        }

        .controls-stack {
          gap: 18px;
        }

        .panel-accent {
          background: radial-gradient(circle at top right, rgba(96, 165, 250, 0.14), transparent 36%), linear-gradient(180deg, rgba(255, 255, 255, 0.09), rgba(148, 163, 184, 0.05)), rgba(16, 24, 40, 0.78);
        }

        .panel-muted {
          background: radial-gradient(circle at top left, rgba(148, 163, 184, 0.12), transparent 36%), linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(148, 163, 184, 0.045)), rgba(16, 24, 40, 0.78);
        }

        .field {
          gap: 8px;
          margin-bottom: 14px;
        }

        .field span,
        .hero-label,
        .panel-kicker,
        .hero-kicker,
        .eyebrow {
          color: #cbd5e1;
          text-transform: uppercase;
          letter-spacing: 0.22em;
          font-size: 11px;
          font-weight: 700;
        }

        .input {
          width: 100%;
          border: 1px solid rgba(148, 163, 184, 0.16);
          border-radius: 16px;
          padding: 14px 16px;
          background: rgba(15, 23, 42, 0.86);
          color: #f8fafc;
          outline: none;
          font-size: 1rem;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
        }

        .input::placeholder {
          color: rgba(203, 213, 225, 0.55);
        }

        .input:focus {
          border-color: rgba(96, 165, 250, 0.95);
          box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.16);
        }

        .button {
          appearance: none;
          border: 1px solid transparent;
          border-radius: 16px;
          padding: 13px 16px;
          font-size: 0.98rem;
          font-weight: 700;
          color: #f8fafc;
          background: rgba(255, 255, 255, 0.06);
          cursor: pointer;
          transition: transform 160ms ease, box-shadow 160ms ease;
        }

        .button.primary {
          background: linear-gradient(135deg, #60a5fa 0%, #38bdf8 55%, #93c5fd 100%);
          color: #07111f;
        }

        .button.secondary {
          background: linear-gradient(135deg, rgba(96, 165, 250, 0.18), rgba(148, 163, 184, 0.14));
          border-color: rgba(96, 165, 250, 0.2);
        }

        .button.ghost {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(148, 163, 184, 0.12);
        }

        .button.small {
          padding: 10px 13px;
          font-size: 0.88rem;
        }

        .chat-panel-shell {
          padding: clamp(20px, 2.6vw, 30px);
          gap: 16px;
        }

        .chat-topbar-shell {
          padding-bottom: 12px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }

        .room-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .message-list-shell {
          background: rgba(15, 23, 42, 0.32);
          border-radius: 22px;
          padding: 18px 12px 18px 14px;
        }

        .message-list {
          min-height: 420px;
          max-height: 540px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 4px 2px 10px;
          border-top: 1px solid rgba(148, 163, 184, 0.08);
          border-bottom: 1px solid rgba(148, 163, 184, 0.08);
        }

        .empty-state {
          min-height: 340px;
          display: grid;
          place-items: center;
          text-align: center;
          padding: 40px 18px;
          color: #cbd5e1;
        }

        .message {
          display: flex;
          gap: 12px;
          align-items: flex-end;
          max-width: min(88%, 760px);
          animation: messageIn 320ms ease both;
        }

        .message:nth-child(even) {
          transform: translateX(2px);
        }

        .message:nth-child(odd) {
          transform: translateX(-1px);
        }

        .message.mine {
          align-self: flex-end;
          flex-direction: row-reverse;
        }

        .avatar {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          flex-shrink: 0;
          color: #05101d;
          font-weight: 900;
          background: linear-gradient(135deg, #cbd5e1 0%, #93c5fd 34%, #60a5fa 70%, #38bdf8 100%);
          box-shadow: 0 10px 30px rgba(96, 165, 250, 0.18);
        }

        .message-body {
          gap: 6px;
        }

        .message.mine .message-body {
          align-items: end;
        }

        .message-meta {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 0.84rem;
          color: #94a3b8;
        }

        .bubble {
          padding: 14px 16px;
          border-radius: 18px 18px 18px 6px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.09), rgba(148, 163, 184, 0.05));
          border: 1px solid rgba(148, 163, 184, 0.12);
          line-height: 1.6;
          word-break: break-word;
        }

        .message.mine .bubble {
          background: linear-gradient(135deg, #60a5fa 0%, #38bdf8 55%, #93c5fd 100%);
          color: #061018;
          border-color: transparent;
          border-radius: 18px 18px 6px 18px;
        }

        .composer-shell {
          border-radius: 22px;
          padding: 8px;
          background: rgba(148, 163, 184, 0.06);
          border: 1px solid rgba(148, 163, 184, 0.1);
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 12px;
        }

        .composer-input {
          min-height: 52px;
          background: rgba(15, 23, 42, 0.9);
        }

        .status-bar {
          padding: 8px 10px;
          border-radius: 14px;
          background: rgba(148, 163, 184, 0.06);
          border: 1px solid rgba(148, 163, 184, 0.08);
        }

        .status.error {
          color: #fda4af;
        }

        @media (max-width: 1080px) {
          .hero-reworked,
          .dashboard-grid {
            grid-template-columns: 1fr;
          }

          .topbar {
            flex-direction: column;
            align-items: flex-start;
          }

          .topbar-badges {
            justify-content: flex-start;
          }
        }

        @media (max-width: 720px) {
          .app-shell {
            width: min(100%, calc(100% - 16px));
            padding: 14px 0 24px;
            gap: 12px;
          }

          .hero-copy-block,
          .hero-card,
          .panel {
            border-radius: 24px;
          }

          .hero-copy-block {
            padding: 16px;
          }

          .hero-copy-head h2 {
            font-size: clamp(1.6rem, 9vw, 2.4rem);
          }

          .hero-card-grid {
            grid-template-columns: 1fr;
          }

          .chat-topbar-shell {
            flex-direction: column;
            gap: 12px;
          }

          .room-actions {
            width: 100%;
          }

          .room-actions .button {
            flex: 1 1 0;
          }

          .composer-shell {
            grid-template-columns: 1fr;
          }

          .message-list {
            min-height: 300px;
            max-height: none;
          }

          .message {
            max-width: 100%;
          }

          .message:nth-child(even),
          .message:nth-child(odd) {
            transform: none;
          }

          .hero-actions-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }

        @keyframes riseIn {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.98);
          }

          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes messageIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </main>
  );
}
