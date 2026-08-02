import { NextResponse } from 'next/server';
import { addMessage, createMessage, getLobby, getLobbySnapshot, getMember, getMessages } from '@/lib/store';

export const dynamic = 'force-dynamic';

function parseSince(value) {
  const since = Number(value);
  return Number.isFinite(since) && since > 0 ? since : 0;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code') ?? '';
    const since = parseSince(url.searchParams.get('since'));

    if (!code || code.length !== 6) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
    }

    if (!(await getLobby(code))) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
    }

    return NextResponse.json({
      code,
      lobby: await getLobbySnapshot(code),
      messages: (await getMessages(code, since)) ?? [],
    });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { code, memberId, text } = await request.json();

    if (!code || code.length !== 6) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
    }

    if (!memberId) {
      return NextResponse.json({ error: 'Member required' }, { status: 400 });
    }

    const cleanText = typeof text === 'string' ? text.trim() : '';

    if (!cleanText) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    const lobby = await getLobby(code);

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
    }

    const member = await getMember(code, memberId);

    if (!member) {
      return NextResponse.json({ error: 'You are no longer in this lobby' }, { status: 403 });
    }

    const message = createMessage(member, cleanText);
    await addMessage(code, message);

    return NextResponse.json({
      code,
      lobby: await getLobbySnapshot(code),
      message,
    });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}