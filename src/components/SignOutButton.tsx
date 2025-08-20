'use client'

import { useSession, signOut } from 'next-auth/react'

export default function SignOutButton() {
  const { status } = useSession()

  if (status !== 'authenticated') return null

  return (
    <button
      onClick={() => signOut()}
      className="fixed top-3 right-3 z-50 rounded-md bg-gray-800 text-white px-3 py-1.5 text-sm hover:bg-gray-700 transition-colors"
      aria-label="Sign out"
    >
      Sign out
    </button>
  )
}


