import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; chatId: string }> }
) {
  const { id, chatId } = await params
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Ensure the chat session belongs to the user and document
    const chat = await prisma.chatSession.findFirst({
      where: {
        id: chatId,
        documentId: id,
        userId: session.user.id,
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
    }

    const messages = chat.messages.map((m) => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      timestamp: m.createdAt,
    }))

    return NextResponse.json({ messages })
  } catch (err) {
    console.error('Error fetching chat messages:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

