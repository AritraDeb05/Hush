import { NextResponse } from 'next/server';
import { getLobby, getLobbySnapshot, getMessages, joinLobby, makeMember } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { code, name } = await request.json();

    if (!code || code.length !== 6) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
    }
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name required' }, { status: 400 });
    }

    const lobby = await getLobby(code);

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
    }

    const member = makeMember(name);
    const joinedLobby = await joinLobby(code, member);

    if (joinedLobby === 'full') {
      return NextResponse.json({ error: 'Lobby is full' }, { status: 409 });
    }

    return NextResponse.json({
      code,
      member,
      lobby: await getLobbySnapshot(code),
      messages: (await getMessages(code, member.joinedAt)) ?? [],
    });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
     