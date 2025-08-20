import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify document belongs to user
    const doc = await prisma.document.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true }
    })
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const sessions = await prisma.chatSession.findMany({
      where: { documentId: doc.id, userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { messages: true } } },
    })

    const chats = sessions.map((s) => ({
      id: s.id,
      timestamp: s.createdAt,
      messageCount: s._count.messages,
    }))

    return NextResponse.json({ chats })
  } catch (err) {
    console.error('Error fetching chat sessions:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

