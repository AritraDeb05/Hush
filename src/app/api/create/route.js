import { NextResponse } from 'next/server';
import { createLobby, getLobbySnapshot, lobbyExists, makeMember } from '@/lib/store';

function randCode() {
  let c = '';
  for (let i = 0; i < 6; i++) c += Math.floor(Math.random() * 10);
  return c;
}

function uniqueCode() {
  return randCode();
}

export const dynamic = 'force-dynamic';

async function generateUniqueCode() {
  let code = uniqueCode();

  while (await lobbyExists(code)) {
    code = uniqueCode();
  }

  return code;
}

export async function POST(request) {
  try {
    const { name } = await request.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name required' }, { status: 400 });
    }

    const code = await generateUniqueCode();
    const creator = makeMember(name);

    await createLobby(code, creator);

    return NextResponse.json({
      code,
      member: creator,
      lobby: await getLobbySnapshot(code),
      messages: [],
    });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
