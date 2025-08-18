'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import Link from 'next/link'

export default function Home() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/dashboard')
    }
  }, [status, router])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center">
          <h1 className="text-6xl font-bold text-gray-900 mb-6">
            AI <span className="text-indigo-600">Tutor</span>
          </h1>
          <p className="text-xl text-gray-600 mb-12 max-w-3xl mx-auto">
            Transform your PDF documents into interactive learning experiences. 
            Chat with AI, get instant explanations, and visualize content with smart annotations.
          </p>
          
          <div className="flex gap-4 justify-center">
            <Link
              href="/auth/signup"
              className="bg-indigo-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
            >
              Get Started
            </Link>
            <Link
              href="/auth/signin"
              className="border border-indigo-600 text-indigo-600 px-8 py-3 rounded-lg font-semibold hover:bg-indigo-50 transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>

        <div className="mt-20 grid md:grid-cols-3 gap-8">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="text-indigo-600 text-2xl mb-4">📚</div>
            <h3 className="text-xl font-semibold mb-2">Upload PDFs</h3>
            <p className="text-gray-600">
              Simply upload your PDF documents and start learning immediately.
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="text-indigo-600 text-2xl mb-4">💬</div>
            <h3 className="text-xl font-semibold mb-2">Interactive Chat</h3>
            <p className="text-gray-600">
              Ask questions about your documents and get instant, contextual answers.
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="text-indigo-600 text-2xl mb-4">🎯</div>
            <h3 className="text-xl font-semibold mb-2">Smart Annotations</h3>
            <p className="text-gray-600">
              AI highlights and annotates relevant sections as you learn.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
