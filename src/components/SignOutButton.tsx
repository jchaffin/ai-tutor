'use client'

import { useSession, signOut } from 'next-auth/react'
import { Button } from '@/components/ui/Button'

export default function SignOutButton() {
  const { status } = useSession()

  if (status !== 'authenticated') return null

  return (
    <div className="fixed top-3 right-3 z-50">
      <Button
        onClick={() => signOut()}
        size="sm"
        className="rounded-full bg-gray-800 text-white hover:bg-gray-700"
        aria-label="Sign out"
      >
        Sign out
      </Button>
    </div>
  )
}


