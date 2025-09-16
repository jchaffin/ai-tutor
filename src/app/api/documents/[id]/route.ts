import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { unlink } from 'fs/promises'
import { join } from 'path'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const session = await auth()
    
    console.log('Session:', session)
    console.log('Looking for document ID:', id)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('User ID from session:', session.user.id)

    const document = await prisma.document.findFirst({
      where: {
        id: id,
        userId: session.user.id
      },
      select: {
        id: true,
        title: true,
        filename: true,
        filepath: true,
        mimeType: true,
        size: true,
        createdAt: true,
      }
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    return NextResponse.json(document)
  } catch (error) {
    console.error('Error fetching document:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { title } = await request.json().catch(() => ({})) as { title?: string }
    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const doc = await prisma.document.findFirst({ where: { id, userId: session.user.id } })
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    const updated = await prisma.document.update({ where: { id }, data: { title: title.trim() } })
    return NextResponse.json({ id: updated.id, title: updated.title })
  } catch (error) {
    console.error('Error updating document title:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const doc = await prisma.document.findFirst({ where: { id, userId: session.user.id } })
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    // Best-effort: delete local file if stored under /uploads
    if (doc.filepath && doc.filepath.startsWith('/uploads/')) {
      try {
        const filename = doc.filepath.replace('/uploads/', '')
        const filePath = join(process.cwd(), 'uploads', filename)
        await unlink(filePath)
      } catch {}
    }

    await prisma.document.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting document:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
