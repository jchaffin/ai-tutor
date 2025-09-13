'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { BookOpen, Upload, ArrowRight } from 'lucide-react'

interface Document {
  id: string
  title: string
  filename: string
  createdAt: string
}

export default function TutorPage() {
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
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            AI <span className="text-[var(--brand)]">Tutor</span>
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Choose a document to start learning with your AI tutor. Ask questions, get explanations, and explore your PDFs with intelligent guidance.
          </p>
        </div>

        {/* Documents Grid */}
        {documents.length > 0 ? (
          <div className="mb-12">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">Your Documents</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-shadow cursor-pointer group"
                  onClick={() => router.push(`/tutor/${doc.id}`)}
                >
                  <div className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-[var(--brand)] rounded-xl flex items-center justify-center">
                        <BookOpen className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 line-clamp-2 group-hover:text-[var(--brand)] transition-colors">
                          {doc.title}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {new Date(doc.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Start learning</span>
                      <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-[var(--brand)] transition-colors" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-2xl shadow-lg mb-12">
            <div className="text-6xl text-gray-400 mb-6">📚</div>
            <h3 className="text-2xl font-semibold text-gray-900 mb-4">No documents yet</h3>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              Upload your first PDF to start learning with your AI tutor. Get personalized explanations, ask questions, and explore your documents like never before.
            </p>
            <Link href="/upload">
              <Button className="inline-flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Upload Your First PDF
              </Button>
            </Link>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <Upload className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Upload New Document</h3>
            </div>
            <p className="text-gray-600 mb-4">
              Add more PDFs to your collection and start learning with AI-powered tutoring.
            </p>
            <Link href="/upload">
              <Button variant="outline" className="w-full">
                Upload PDF
              </Button>
            </Link>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">View Dashboard</h3>
            </div>
            <p className="text-gray-600 mb-4">
              Manage all your documents, view upload history, and organize your learning materials.
            </p>
            <Link href="/dashboard">
              <Button variant="outline" className="w-full">
                Go to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
