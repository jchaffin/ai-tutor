'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'

const PDFViewer = dynamic(() => import("@/components/pdf/PDFViewer"), {
  ssr: false,
  loading: () => (
    <div className="p-4 text-sm text-gray-600">Loading viewer…</div>
  ),
})
import ChatInterface from '@/components/ChatInterface'
import { TranscriptProvider } from '@/contexts/TranscriptContext'

interface Document {
  id: string
  title: string
  filename: string
  filepath: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface Annotation {
  id: string
  page: number
  x: number
  y: number
  width: number
  height: number
  type: 'highlight' | 'circle' | 'rectangle'
  color: string
  text?: string
}

export default function TutorPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const documentId = typeof params.id === 'string' ? params.id : params.id?.[0] || ''

  const [document, setDocument] = useState<Document | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [loading, setLoading] = useState(true)
  const [chatLoading, setChatLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [pdfContent, setPdfContent] = useState<string>('')

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    }
  }, [status, router])

  useEffect(() => {
    if (session && documentId) {
      fetchDocument()
      fetchChatHistory()
    }
  }, [session, documentId])

  const fetchDocument = async () => {
    try {
      const res = await fetch(`/api/documents/${documentId}`)
      if (res.ok) {
        const data = await res.json()
        setDocument(data)
        // For now, we'll use a placeholder for PDF content
        // TODO: Implement proper PDF text extraction
        setPdfContent(`Document: ${data.title}\nFilename: ${data.filename}\nThis is a PDF document that the student is viewing.`)
      } else if (res.status === 404) {
        setError('Document not found')
      } else {
        setError('Failed to load document')
      }
    } catch (error) {
      setError('Failed to load document')
      console.error('Error fetching document:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchChatHistory = async () => {
    try {
      const res = await fetch(`/api/chat/${documentId}`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
        setAnnotations(data.annotations || [])
      }
    } catch (error) {
      console.error('Error fetching chat history:', error)
    }
  }

  const handleSendMessage = async (content: string) => {
    if (!document) return

    // Add user message immediately
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date()
    }
    setMessages(prev => [...prev, userMessage])
    setChatLoading(true)

    try {
      const res = await fetch(`/api/chat/${documentId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: content,
          currentPage
        }),
      })

      if (res.ok) {
        const data = await res.json()
        
        // Add assistant message
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.response,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, assistantMessage])

        // Update annotations if provided
        if (data.annotations && data.annotations.length > 0) {
          setAnnotations(prev => [...prev, ...data.annotations])
        }

        // Navigate to page if specified
        if (data.navigateToPage) {
          setCurrentPage(data.navigateToPage)
        }
      } else {
        // Add error message
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Sorry, I encountered an error processing your request. Please try again.',
          timestamp: new Date()
        }
        setMessages(prev => [...prev, errorMessage])
      }
    } catch (error) {
      console.error('Error sending message:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setChatLoading(false)
    }
  }

  const handleVoiceInput = (isRecording: boolean) => {
    // TODO: Implement voice input functionality
    console.log('Voice input:', isRecording)
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return null
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg text-red-600 mb-4">{error}</div>
          <Link
            href="/dashboard"
            className="text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  if (!document) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Document not found</div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between p-4 bg-white border-b shadow-sm">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            ← Dashboard
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{document.title}</h1>
            <p className="text-sm text-gray-600">{document.filename}</p>
          </div>
        </div>
        <div className="text-sm text-gray-600">
          Welcome, {session?.user?.name || session?.user?.email}
        </div>
      </header>

      {/* Main Content - Split Screen */}
      <div className="flex-1 flex overflow-hidden">
        {/* PDF Viewer */}
        <div className="w-1/2 border-r">
          <PDFViewer
            fileUrl={`/api/files/${documentId}`}
            annotations={annotations}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
          />
        </div>

        {/* Chat Interface */}
        <div className="w-1/2">
          <TranscriptProvider>
            <ChatInterface
              messages={messages}
              onSendMessage={handleSendMessage}
              isLoading={chatLoading}
              pdfTitle={document.title}
              pdfContent={pdfContent}
              currentPage={currentPage}
              onAnnotationCreated={(annotation) => {
                setAnnotations(prev => [...prev, annotation])
              }}
              onPageNavigation={(page) => {
                setCurrentPage(page)
              }}
            />
          </TranscriptProvider>
        </div>
      </div>
    </div>
  )
}
