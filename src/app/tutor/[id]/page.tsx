'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
// import Link from 'next/link'
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
import Link from 'next/link'

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
  const [startNewSession, setStartNewSession] = useState<boolean>(false)

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

  // Expose current document id globally for session-level features
  useEffect(() => {
    if (typeof window !== 'undefined' && documentId) {
      ;(window as any).__currentDocumentId = documentId
    }
  }, [documentId])

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
    console.log('🎯 UI: Event listeners attached')

    return () => {
      window.removeEventListener('tutor-page-navigation', handlePageNavigation as EventListener)
    }
  }, [])

  const fetchDocument = async () => {
    try {
      console.log("📄 Fetching document with ID:", documentId);
      const res = await fetch(`/api/documents/${documentId}`)
      if (res.ok) {
        const data = await res.json()
        console.log("📄 Document data received:", data);
        setDoc(data)
        
        // Fetch PDF content for the agent (title is already extracted on upload)
        try {
          const pdfRes = await fetch(`/api/documents/${documentId}/content`)
          if (pdfRes.ok) {
            const { content } = await pdfRes.json()
            console.log("📄 PDF content extracted, length:", content?.length || 0);
            setPdfContent(content)
          } else {
            const fallbackContent = `Document: ${data.title}\nThis is a PDF document that the student is viewing.`;
            console.log("📄 Using fallback content:", fallbackContent);
            setPdfContent(fallbackContent)
          }
        } catch (error) {
          console.error('Error extracting PDF content:', error)
          const fallbackContent = `Document: ${data.title}\nThis is a PDF document that the student is viewing.`;
          console.log("📄 Using fallback content due to error:", fallbackContent);
          setPdfContent(fallbackContent)
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
          currentPage,
          newSession: startNewSession === true
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
        // Reset the new session flag once used
        if (startNewSession) setStartNewSession(false)

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
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{doc.title}</h1>
            <p className="text-sm text-gray-600">{doc.title}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 relative">
          <UserMenuInline name={session?.user?.name || session?.user?.email || 'Test User'} documentId={documentId} />
        </div>
      </header>

      {/* Main Content - Completely Separated */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* PDF Viewer - Completely Independent Left Side */}
        <div className="w-1/2 border-r flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-auto">
            <PDFViewer
              key="pdf-viewer-stable"
              fileUrl={`/api/files/${documentId}`}
              onPageChange={setCurrentPage}
              currentPage={currentPage}
            />
          </div>
        </div>
 
        {/* Chat Interface - Completely Independent Right Side */}
        <div className="w-1/2 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-hidden">
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
                  setMessages={setMessages}
                  documentId={documentId}
                  onNewSession={() => setStartNewSession(true)}
                />
              </TranscriptProvider>
            </EventProvider>
          </div>
        </div>
      </div>
    </div>
  )
}

function UserMenuInline({ name, documentId }: { name: string, documentId: string }) {
  const initials = (name || 'TU').split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase()
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button className="secondary-btn px-3 py-2 rounded-full flex items-center gap-2 cursor-pointer" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand)] text-white text-xs">{initials}</span>
        <span className="hidden sm:inline text-slate-700">{name}</span>
        <span className="text-slate-500">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-44 rounded-xl border bg-white shadow-md z-50">
          <Link href="/dashboard" className="block px-3 py-2 hover:bg-slate-50 cursor-pointer">Dashboard</Link>
          <Link href="/account" className="block px-3 py-2 hover:bg-slate-50 cursor-pointer">Account Settings</Link>
          <button className="w-full text-left px-3 py-2 hover:bg-slate-50 cursor-pointer" onClick={() => {
            window.dispatchEvent(new CustomEvent('toggle-chat-history', { detail: true }))
            setOpen(false)
          }}>Chat History</button>
          <Link href="/upload" className="block px-3 py-2 hover:bg-slate-50 cursor-pointer">Upload</Link>
        </div>
      )}
    </div>
  )
}
