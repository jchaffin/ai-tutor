import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const document = await prisma.document.findFirst({
      where: {
        id: id,
        userId: session.user.id
      }
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // If filepath is a URL (Vercel Blob), redirect to it
    if (document.filepath.startsWith('http')) {
      return NextResponse.redirect(document.filepath)
    }

    // Backward-compat: if local path, return 404 in prod
    return NextResponse.json({ error: 'File is not available' }, { status: 404 })
  } catch (error) {
    console.error('Error serving file:', error)
    return NextResponse.json(
      { error: 'File not found' },
      { status: 404 }
    )
  }
}
