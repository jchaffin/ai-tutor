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
import { EventProvider } from '@/contexts/EventContext'

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

export default function TutorPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const documentId = typeof params.id === 'string' ? params.id : params.id?.[0] || ''

  const [doc, setDoc] = useState<Document | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
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

  // Listen for agent tool events
  useEffect(() => {
    const handlePageNavigation = (event: CustomEvent) => {
      const { page, reason } = event.detail
      console.log(`🧭 UI: Agent navigating to page ${page}: ${reason}`)
      setCurrentPage(page)
      
      // Also forward to the viewer via zero-based event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pdf-navigate-page', { detail: { pageNumber: Math.max(0, (page || 1) - 1) } }))
      }
    }

    const handleAnnotationCreated = (event: CustomEvent) => {
      const { annotation } = event.detail
      console.log('📝 ANNOTATION CREATED:', annotation)
      console.log('📝 ANNOTATION DETAILS:', {
        page: annotation.page,
        x: annotation.x,
        y: annotation.y,
        width: annotation.width,
        height: annotation.height,
        type: annotation.type,
        color: annotation.color,
        text: annotation.text
      })
    }

    const handleClearAnnotations = () => {
      console.log('🧹 Clearing all temporary annotations')
    }

    console.log('🎯 UI: Setting up event listeners')
    window.addEventListener('tutor-page-navigation', handlePageNavigation as EventListener)
    window.addEventListener('tutor-annotation-created', handleAnnotationCreated as EventListener)
    window.addEventListener('tutor-annotations-clear', handleClearAnnotations as EventListener)
    console.log('🎯 UI: Event listeners attached')

    return () => {
      window.removeEventListener('tutor-page-navigation', handlePageNavigation as EventListener)
      window.removeEventListener('tutor-annotation-created', handleAnnotationCreated as EventListener)
      window.removeEventListener('tutor-annotations-clear', handleClearAnnotations as EventListener)
    }
  }, [])

  const fetchDocument = async () => {
    try {
      const res = await fetch(`/api/documents/${documentId}`)
      if (res.ok) {
        const data = await res.json()
        setDoc(data)
        
        // Extract PDF content for the agent
        try {
          const pdfRes = await fetch(`/api/documents/${documentId}/content`)
          if (pdfRes.ok) {
            const { content } = await pdfRes.json()
            setPdfContent(content)
          } else {
            // Fallback to basic info
            setPdfContent(`Document: ${data.title}\nFilename: ${data.filename}\nThis is a PDF document that the student is viewing.`)
          }
        } catch (error) {
          console.error('Error extracting PDF content:', error)
          setPdfContent(`Document: ${data.title}\nFilename: ${data.filename}\nThis is a PDF document that the student is viewing.`)
        }
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
      }
    } catch (error) {
      console.error('Error fetching chat history:', error)
    }
  }

  const handleSendMessage = async (content: string) => {
    if (!doc) return

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

  const navigateToAnnotation = (index: number) => {
    // This function is no longer needed as annotations are removed
  }

  const nextAnnotation = () => {
    // This function is no longer needed as annotations are removed
  }

  const prevAnnotation = () => {
    // This function is no longer needed as annotations are removed
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

  if (!doc) {
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
            <h1 className="text-xl font-semibold text-gray-900">{doc.title}</h1>
            <p className="text-sm text-gray-600">{doc.filename}</p>
          </div>
        </div>
        <div className="text-sm text-gray-600">
          Welcome, {session?.user?.name || session?.user?.email}
        </div>
      </header>

      {/* Main Content - Split Screen */}
      <div className="flex-1 flex overflow-hidden">
        {/* PDF Viewer */}
        <div className="w-1/2 border-r relative">
          {/* Annotation Navigation */}
          {/* This section is no longer needed as annotations are removed */}
          
          <PDFViewer
            fileUrl={`/api/files/${documentId}`}
            onPageChange={setCurrentPage}
            currentPage={currentPage}
          />
        </div>

        {/* Chat Interface */}
        <div className="w-1/2">
          <EventProvider>
            <TranscriptProvider>
              <ChatInterface
                messages={messages}
                onSendMessage={handleSendMessage}
                isLoading={chatLoading}
                pdfTitle={doc.title}
                pdfContent={pdfContent}
                currentPage={currentPage}
                onPageNavigation={setCurrentPage}
              />
            </TranscriptProvider>
          </EventProvider>
        </div>
      </div>
    </div>
  )
}
