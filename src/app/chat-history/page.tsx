'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { MessageSquare, Clock, FileText, Trash2, Eye, Calendar } from 'lucide-react'

interface Document {
  id: string
  title: string
  filename: string
  createdAt: string
}

interface ChatSession {
  id: string
  timestamp: string
  messageCount: number
  document: Document
}

export default function ChatHistoryPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [documents, setDocuments] = useState<Document[]>([])
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null)
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    }
  }, [status, router])

  useEffect(() => {
    if (session) {
      fetchDocuments()
    }
  }, [session])

  useEffect(() => {
    if (selectedDocument) {
      fetchChatSessions(selectedDocument)
    }
  }, [selectedDocument])

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/documents')
      if (res.ok) {
        const data = await res.json()
        setDocuments(data)
        // Auto-select first document if available
        if (data.length > 0) {
          setSelectedDocument(data[0].id)
        }
      }
    } catch (error) {
      console.error('Error fetching documents:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchChatSessions = async (documentId: string) => {
    try {
      const res = await fetch(`/api/chat/${documentId}/history`)
      if (res.ok) {
        const data = await res.json()
        setChatSessions(data.chats || [])
      }
    } catch (error) {
      console.error('Error fetching chat sessions:', error)
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/chat/${selectedDocument}/history/${sessionId}/delete`, {
        method: 'DELETE'
      })
      if (res.ok) {
        // Remove from local state
        setChatSessions(prev => prev.filter(session => session.id !== sessionId))
      }
    } catch (error) {
      console.error('Error deleting chat session:', error)
    } finally {
      setDeletingSessionId(null)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))
    
    if (diffInHours < 1) return 'Just now'
    if (diffInHours < 24) return `${diffInHours}h ago`
    if (diffInHours < 168) return `${Math.floor(diffInHours / 24)}d ago`
    return formatDate(dateString)
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

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Chat History</h1>
            <p className="text-gray-600">View and manage your AI tutoring conversations</p>
          </div>
          <Link href="/dashboard">
            <Button variant="outline">
              ← Back to Dashboard
            </Button>
          </Link>
        </div>

        {documents.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl shadow-lg">
            <div className="text-6xl text-gray-400 mb-6">💬</div>
            <h3 className="text-2xl font-semibold text-gray-900 mb-4">No chat history yet</h3>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              Start chatting with your AI tutor to see your conversation history here.
            </p>
            <Link href="/upload">
              <Button className="inline-flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Upload Your First PDF
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid lg:grid-cols-4 gap-6">
            {/* Document Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Documents</h3>
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => setSelectedDocument(doc.id)}
                      className={`w-full text-left p-3 rounded-xl transition-colors ${
                        selectedDocument === doc.id
                          ? 'bg-[var(--brand)] text-white'
                          : 'hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        <span className="text-sm font-medium truncate">{doc.title}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Chat Sessions */}
            <div className="lg:col-span-3">
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Chat Sessions
                    {selectedDocument && (
                      <span className="text-sm font-normal text-gray-500 ml-2">
                        ({documents.find(d => d.id === selectedDocument)?.title})
                      </span>
                    )}
                  </h3>
                  {selectedDocument && (
                    <Link href={`/tutor/${selectedDocument}`}>
                      <Button size="sm">
                        <MessageSquare className="w-4 h-4 mr-2" />
                        New Chat
                      </Button>
                    </Link>
                  )}
                </div>

                {chatSessions.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-4xl text-gray-400 mb-4">💭</div>
                    <h4 className="text-lg font-medium text-gray-900 mb-2">No conversations yet</h4>
                    <p className="text-gray-600 mb-6">
                      Start chatting with your AI tutor to see your conversation history here.
                    </p>
                    {selectedDocument && (
                      <Link href={`/tutor/${selectedDocument}`}>
                        <Button>
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Start New Chat
                        </Button>
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {chatSessions.map((session) => (
                      <div
                        key={session.id}
                        className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-[var(--brand)] rounded-xl flex items-center justify-center">
                              <MessageSquare className="w-5 h-5 text-white" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900">
                                  {session.messageCount} messages
                                </span>
                                <span className="text-gray-400">•</span>
                                <span className="text-sm text-gray-600">
                                  {getRelativeTime(session.timestamp)}
                                </span>
                              </div>
                              <div className="text-sm text-gray-500">
                                {formatDate(session.timestamp)}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Link href={`/tutor/${selectedDocument}?session=${session.id}`}>
                              <Button variant="outline" size="sm">
                                <Eye className="w-4 h-4 mr-1" />
                                View
                              </Button>
                            </Link>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDeletingSessionId(session.id)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deletingSessionId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
            <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-2">Delete Chat Session?</h4>
              <p className="text-gray-600 mb-6">
                This will permanently delete this chat session and all its messages.
              </p>
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setDeletingSessionId(null)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => handleDeleteSession(deletingSessionId)}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
