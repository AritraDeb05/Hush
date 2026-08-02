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

  function leaveLobby() {
    window.localStorage.removeItem(STORAGE_KEY);
    setSession(null);
    setMessages([]);
    setLobby(null);
    setMessageText('');
    setNotice('Lobby closed on this device. Rejoin with the same code if it is still active.');
  }

  const memberCount = lobby?.memberCount ?? (session ? 1 : 0);
  const maxMembers = lobby?.maxMembers ?? 8;

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Temporary group chat</p>
          <h1>Hush</h1>
          <p className="hero-copy">
            A private lobby for friends. Messages only appear from the moment you join, and each room stops at 8 people.
          </p>
        </div>
        <div className="hero-card">
          <span className="hero-stat">{session ? `${memberCount}/${maxMembers} in room` : 'Fresh room'}</span>
          <span className="hero-stat subtle">{session ? `Joined ${formatJoined(session.member.joinedAt)}` : 'No history for new members'}</span>
          <span className="hero-stat subtle">{session ? `Code ${session.code}` : 'Create a 6-digit invite code'}</span>
        </div>
      </section>

      <section className="control-grid">
        <form className="panel" onSubmit={createLobby}>
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

        <form className="panel" onSubmit={joinExistingLobby}>
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
      </section>

      <section className="panel chat-panel">
        <div className="chat-topbar">
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

        <div className="message-list">
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

        <form className="composer" onSubmit={sendMessage}>
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

      <p className={`status ${error ? 'error' : ''}`}>{error || `Up to ${maxMembers} people per room. Messages stay hidden until a member joins.`}</p>
    </main>
  );
}