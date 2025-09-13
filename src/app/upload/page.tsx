'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'

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

export default function Upload() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    }
  }, [status, router])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    setError('')

    if (selectedFile) {
      if (selectedFile.type !== 'application/pdf') {
        setError('Please select a PDF file')
        return
      }
      
      if (selectedFile.size > 10 * 1024 * 1024) { // 10MB limit
        setError('File size must be less than 10MB')
        return
      }

      setFile(selectedFile)
    }
  }

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file')
      return
    }

    setUploading(true)
    setError('')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (res.ok) {
        const data = await res.json()
        router.push(`/tutor/${data.documentId}`)
      } else {
        const data = await res.json()
        setError(data.error || 'Upload failed')
      }
    } catch (error) {
      setError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
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
          <Link href="/dashboard" className="text-2xl font-bold text-gray-900">
            AI <span className="text-[var(--brand)]">Tutor</span>
          </Link>
          <UserMenuInline name={session?.user?.name || 'User'} documentId="" />
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Upload PDF Document</h1>
          
          <div className="bg-white p-8 rounded-lg shadow-md">
            <div className="mb-6">
              <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 mb-2">
                Select PDF File
              </label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md hover:border-gray-400 transition-colors">
                <div className="space-y-1 text-center">
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400"
                    stroke="currentColor"
                    fill="none"
                    viewBox="0 0 48 48"
                    aria-hidden="true"
                  >
                    <path
                      d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div className="flex text-sm text-gray-600">
                    <label
                      htmlFor="file-upload"
                      className="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500"
                    >
                      <span>Upload a file</span>
                      <input
                        id="file-upload"
                        name="file-upload"
                        type="file"
                        className="sr-only"
                        accept=".pdf"
                        onChange={handleFileChange}
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500">PDF up to 10MB</p>
                </div>
              </div>
            </div>

            {file && (
              <div className="mb-6 p-4 bg-gray-50 rounded-md">
                <div className="flex items-center">
                  <div className="text-red-500 text-xl mr-3">📄</div>
                  <div>
                    <p className="font-medium text-gray-900">{file.name}</p>
                    <p className="text-sm text-gray-500">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <Button
              onClick={handleUpload}
              disabled={!file || uploading}
              variant="default"
              size="lg"
              className="w-full"
            >
              {uploading ? 'Uploading...' : 'Upload and Start Learning'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
