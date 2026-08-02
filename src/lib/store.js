const globalForHush = globalThis;
const lobbies = globalForHush.__hushLobbies ?? new Map();

globalForHush.__hushLobbies = lobbies;

const KV_REST_API_URL = process.env.KV_REST_API_URL;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;
const USE_KV = Boolean(KV_REST_API_URL && KV_REST_API_TOKEN);
const LOBBY_TTL_SECONDS = 24 * 60 * 60;

if (!globalForHush.__hushCleanupStarted) {
  globalForHush.__hushCleanupStarted = true;

  setInterval(() => {
    const now = Date.now();

    for (const [code, lobby] of lobbies) {
      if (now - lobby.createdAt > LOBBY_TTL_SECONDS * 1000) {
        lobbies.delete(code);
      }
    }
  }, 60 * 60 * 1000);
}

function createId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function publicLobbySnapshot(lobby) {
  return {
    code: lobby.code,
    createdAt: lobby.createdAt,
    updatedAt: lobby.updatedAt,
    memberCount: lobby.members.length,
    maxMembers: 8,
  };
}

function lobbyKey(code) {
  return `hush:lobby:${code}`;
}

async function kvRequest(path, init = {}) {
  const response = await fetch(`${KV_REST_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`KV request failed: ${response.status} ${text}`);
  }

  return response.json();
}

async function kvGetLobby(code) {
  const result = await kvRequest(`/get/${encodeURIComponent(lobbyKey(code))}`);
  const raw = result?.result;

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function kvSetLobby(code, lobby) {
  await kvRequest(
    `/set/${encodeURIComponent(lobbyKey(code))}/${encodeURIComponent(JSON.stringify(lobby))}?ex=${LOBBY_TTL_SECONDS}`,
    { method: 'POST' },
  );
}

async function kvDeleteLobby(code) {
  await kvRequest(`/del/${encodeURIComponent(lobbyKey(code))}`, { method: 'POST' });
}

function upsertLocalLobby(code, lobby) {
  lobbies.set(code, lobby);
  return lobby;
}

async function readLobby(code) {
  if (USE_KV) {
    return kvGetLobby(code);
  }

  return lobbies.get(code) ?? null;
}

async function writeLobby(code, lobby) {
  if (USE_KV) {
    await kvSetLobby(code, lobby);
    return lobby;
  }

  return upsertLocalLobby(code, lobby);
}

async function removeLobby(code) {
  if (USE_KV) {
    await kvDeleteLobby(code);
    return;
  }

  lobbies.delete(code);
}

export function makeMember(name) {
  return {
    id: createId('member'),
    name: name.trim(),
    joinedAt: Date.now(),
  };
}

export async function getLobby(code) {
  return readLobby(code);
}

export async function getLobbySnapshot(code) {
  const lobby = await readLobby(code);

  if (!lobby) {
    return null;
  }

  return publicLobbySnapshot(lobby);
}

export async function createLobby(code, creator) {
  const now = Date.now();
  const lobby = {
    code,
    members: [creator],
    messages: [],
    createdAt: now,
    updatedAt: now,
  };

  await writeLobby(code, lobby);

  return lobby;
}

export async function joinLobby(code, member) {
  const lobby = await readLobby(code);

  if (!lobby) {
    return null;
  }

  if (lobby.members.length >= 8) {
    return 'full';
  }

  const alreadyJoined = lobby.members.some((existingMember) => existingMember.id === member.id);

  if (!alreadyJoined) {
    lobby.members.push(member);
    lobby.updatedAt = Date.now();
    await writeLobby(code, lobby);
  }

  return lobby;
}

export async function isMemberInLobby(code, memberId) {
  const lobby = await readLobby(code);

  if (!lobby) {
    return false;
  }

  return lobby.members.some((member) => member.id === memberId);
}

export async function addMessage(code, message) {
  const lobby = await readLobby(code);

  if (!lobby) {
    return null;
  }

  lobby.messages.push(message);
  lobby.updatedAt = Date.now();
  await writeLobby(code, lobby);

  return lobby;
}

export async function getMessages(code, since = 0) {
  const lobby = await readLobby(code);

  if (!lobby) {
    return null;
  }

  return lobby.messages.filter((message) => message.createdAt >= since);
}

export async function getMember(code, memberId) {
  const lobby = await readLobby(code);

  if (!lobby) {
    return null;
  }

  return lobby.members.find((member) => member.id === memberId) ?? null;
}

export async function lobbyExists(code) {
  const lobby = await readLobby(code);
  return Boolean(lobby);
}

export async function deleteLobby(code) {
  await removeLobby(code);
}

export function createMessage(member, text) {
  return {
    id: createId('msg'),
    memberId: member.id,
    memberName: member.name,
    text: text.trim(),
    createdAt: Date.now(),
  };
}