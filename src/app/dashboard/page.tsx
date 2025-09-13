'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'


interface RenameState {
  id: string
  title: string
}

interface Document {
  id: string
  title: string
  filename: string
  filepath?: string
  createdAt: string
}

export default function Dashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [rename, setRename] = useState<RenameState | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [userMenuOpen, setUserMenuOpen] = useState<boolean>(false)

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

  const handleRename = (doc: Document) => {
    setRename({ id: doc.id, title: doc.title })
    setMenuOpenId(null)
  }

  const submitRename = async () => {
    if (!rename) return
    const { id, title } = rename
    const newTitle = title.trim()
    if (!newTitle) return
    // optimistic update
    setDocuments(prev => prev.map(d => (d.id === id ? { ...d, title: newTitle } : d)))
    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle })
      })
      if (!res.ok) throw new Error('Failed to rename')
    } catch (e) {
      // revert by refetching on error
      await fetchDocuments()
      console.error(e)
    } finally {
      setRename(null)
    }
  }

  const handleDelete = (doc: Document) => {
    setDeletingId(doc.id)
    setMenuOpenId(null)
  }

  const confirmDelete = async () => {
    if (!deletingId) return
    const id = deletingId
    // optimistic removal
    setDocuments(prev => prev.filter(d => d.id !== id))
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
    } catch (e) {
      console.error(e)
      // refetch to restore
      await fetchDocuments()
    } finally {
      setDeletingId(null)
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
    <>
    <div className="min-h-screen bg-white text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-extrabold text-slate-900">
            AI <span className="text-[var(--brand)]">Tutor</span>
          </h1>
          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                className="secondary-btn px-3 py-2 rounded-full flex items-center gap-2 cursor-pointer"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand)] text-white text-xs">
                  {(session?.user?.name || session?.user?.email || 'TU').split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase()}
                </span>
                <span className="hidden sm:inline text-slate-700">{session?.user?.name || session?.user?.email || 'Test User'}</span>
                <span className="text-slate-500">▾</span>
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-44 rounded-xl border bg-white shadow-md z-50">
                  <Link href="/dashboard" className="block px-3 py-2 hover:bg-slate-50 cursor-pointer">Dashboard</Link>
                  <Link href="/upload" className="block px-3 py-2 hover:bg-slate-50 cursor-pointer">Upload</Link>
                  <Link href="/chat-history" className="block px-3 py-2 hover:bg-slate-50 cursor-pointer">Chat History</Link>
                  <button className="w-full text-left px-3 py-2 hover:bg-slate-50 cursor-pointer" onClick={() => signOut()}>Sign out</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-10">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-bold text-slate-900">Your Documents</h2>
          <Link href="/upload" className="primary-btn px-6 py-2 font-semibold">
            Upload PDF
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="text-lg text-slate-600">Loading documents...</div>
          </div>
        ) : documents.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="card-glass p-4 rounded-2xl hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => router.push(`/tutor/${doc.id}`)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="w-full aspect-[4/3] overflow-hidden rounded-xl border bg-slate-50">
                      {doc.filepath ? (
                        <object data={`${doc.filepath}#page=1`} type="application/pdf" className="w-full h-full pointer-events-none" aria-label="PDF preview" />
                      ) : (
                        <div className="w-full h-full" />
                      )}
                    </div>
                    <h3 className="mt-3 font-semibold text-slate-900 line-clamp-2 break-words">
                      {doc.title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">Uploaded {new Date(doc.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="relative">
                    <button
                      className="px-2 py-1 text-slate-600 hover:text-slate-900 cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === doc.id ? null : doc.id) }}
                      aria-label="Document actions"
                    >
                      ⋮
                    </button>
                    {menuOpenId === doc.id && (
                      <div className="absolute right-0 mt-2 w-40 rounded-xl border bg-white shadow-md z-10">
                        <button
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); router.push(`/tutor/${doc.id}`) }}
                        >
                          Open
                        </button>
                        <button
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); handleRename(doc) }}
                        >
                          Rename
                        </button>
                        <button
                          className="w-full text-left px-3 py-2 text-red-600 hover:bg-red-50 cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); handleDelete(doc) }}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="text-6xl text-slate-400 mb-4">📚</div>
            <h3 className="text-xl font-semibold text-slate-900 mb-2">No documents yet</h3>
            <p className="text-slate-600 mb-6">Upload your first PDF to start learning with AI</p>
            <Link href="/upload" className="primary-btn px-6 py-2 font-semibold">
              Upload Your First PDF
            </Link>
          </div>
        )}
      </div>
    </div>

    {/* Rename Modal */}
    {rename && (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6">
          <h4 className="text-lg font-semibold text-slate-900 mb-2">Rename document</h4>
          <input
            className="w-full border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--brand)]"
            value={rename?.title ?? ''}
            onChange={(e) => setRename((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
            onKeyDown={(e) => { if (e.key === 'Enter') submitRename() }}
            aria-label="Document title"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button className="px-4 py-2 rounded-full border cursor-pointer" onClick={() => setRename(null)}>Cancel</button>
            <button className="primary-btn px-4 py-2 rounded-full" onClick={submitRename}>Save</button>
          </div>
        </div>
      </div>
    )}

    {/* Delete Confirm */}
    {deletingId && (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6">
          <h4 className="text-lg font-semibold text-slate-900 mb-2">Remove document?</h4>
          <p className="text-slate-600">This will delete the document permanently.</p>
          <div className="mt-4 flex justify-end gap-2">
            <button className="px-4 py-2 rounded-full border cursor-pointer" onClick={() => setDeletingId(null)}>Cancel</button>
            <button className="px-4 py-2 rounded-full bg-red-600 text-white hover:brightness-105 cursor-pointer" onClick={confirmDelete}>Delete</button>
          </div>
        </div>
      </div>
    )}
  </>
  )
}
