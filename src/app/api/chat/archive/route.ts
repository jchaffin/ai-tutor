import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface ArchiveMessage {
  id?: string
  role: 'user' | 'assistant'
  content: string
  timestamp?: string | Date
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => null) as {
      documentId?: string
      messages?: ArchiveMessage[]
      timestamp?: string
    } | null

    if (!body || !body.documentId || !Array.isArray(body.messages)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const { documentId, messages, timestamp } = body

    // Validate document belongs to user
    const document = await prisma.document.findFirst({
      where: { id: documentId, userId: session.user.id },
      select: { id: true }
    })
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Create a new chat session for the archive
    const chatSession = await prisma.chatSession.create({
      data: {
        userId: session.user.id,
        documentId: document.id,
        // createdAt will default to now; we can optionally seed from timestamp if provided
        ...(timestamp ? { createdAt: new Date(timestamp) } : {}),
      }
    })

    // Persist messages (ignore unknown roles)
    const sanitized = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({
        chatSessionId: chatSession.id,
        role: m.role,
        content: m.content,
        createdAt: m.timestamp ? new Date(m.timestamp) : undefined,
      }))

    if (sanitized.length > 0) {
      // createMany doesn't support undefined fields reliably across providers; split to individual creates
      for (const data of sanitized) {
        const { createdAt, ...rest } = data
        await prisma.message.create({
          data: {
            ...rest,
            ...(createdAt ? { createdAt } : {}),
          },
        })
      }
    }

    return NextResponse.json({
      ok: true,
      chatId: chatSession.id,
      messageCount: sanitized.length,
    })
  } catch (err) {
    console.error('Error archiving chat:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

