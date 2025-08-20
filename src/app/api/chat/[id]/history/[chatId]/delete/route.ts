import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; chatId: string }> }
) {
  const { id, chatId } = await params
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify the chat session belongs to the user and document
    const chatSession = await prisma.chatSession.findFirst({
      where: {
        id: chatId,
        documentId: id,
        userId: session.user.id,
      }
    })

    if (!chatSession) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
    }

    // Delete the chat session (messages will be cascade deleted)
    await prisma.chatSession.delete({
      where: { id: chatId }
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error deleting chat:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
