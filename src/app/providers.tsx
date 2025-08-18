'use client'

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react'
import { EventProvider } from '@/contexts/EventContext'
import { TranscriptProvider } from '@/contexts/TranscriptContext'

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider>
      <EventProvider>
        <TranscriptProvider>
          {children}
        </TranscriptProvider>
      </EventProvider>
    </NextAuthSessionProvider>
  )
}
