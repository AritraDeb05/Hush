import { NextResponse } from 'next/server';
import { getLobby, getLobbySnapshot, removeMember } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { code, memberId } = await request.json();

    if (!code || code.length !== 6) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
    }

    if (!memberId) {
      return NextResponse.json({ error: 'Member required' }, { status: 400 });
    }

    const lobby = await getLobby(code);

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
    }

    await removeMember(code, memberId);

    return NextResponse.json({
      code,
      lobby: await getLobbySnapshot(code),
    });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
