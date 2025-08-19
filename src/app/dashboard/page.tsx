'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Document {
  id: string
  title: string
  filename: string
  createdAt: string
}

export default function Dashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)

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

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/documents')
      if (res.ok) {
        const data = await res.json()
        setDocuments(data)
      }
    } catch (error) {
      console.error('Error fetching documents:', error)
    } finally {
      setLoading(false)
    }
  }

  if (status === 'loading') {
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">
            AI <span className="text-indigo-600">Tutor</span>
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-600">Welcome, {session?.user?.name || session?.user?.email}</span>
            <button
              onClick={() => signOut()}
              className="text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900">Your Documents</h2>
          <Link
            href="/upload"
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
          >
            Upload PDF
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="text-lg text-gray-600">Loading documents...</div>
          </div>
        ) : documents.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => router.push(`/tutor/${doc.id}`)}
              >
                <div className="flex items-center mb-4">
                  <div className="text-red-500 text-2xl mr-3">📄</div>
                  <div>
                    <h3 className="font-semibold text-gray-900 truncate">{doc.title}</h3>
                    <p className="text-sm text-gray-500">{doc.filename}</p>
                  </div>
                </div>
                <div className="text-xs text-gray-400">
                  Uploaded {new Date(doc.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="text-6xl text-gray-300 mb-4">📚</div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">No documents yet</h3>
            <p className="text-gray-500 mb-6">Upload your first PDF to start learning with AI</p>
            <Link
              href="/upload"
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
            >
              Upload Your First PDF
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
