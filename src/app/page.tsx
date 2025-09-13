'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { BookOpen, Upload, MessageSquare, FileText, Zap } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          {/* Main Banner */}
          <div className="space-y-6">
            <h1 className="text-6xl font-bold leading-tight" style={{ color: 'var(--brand)' }}>
              AI Tutor
            </h1>
            <p className="text-2xl leading-relaxed max-w-3xl mx-auto" style={{ color: 'var(--brand)' }}>
              Create AI generated notes from PDFs, PowerPoints, and Lecture Videos, automatically!
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link href="/auth/signin">
              <Button size="lg" className="px-8 py-4 text-lg">
                Sign In
              </Button>
            </Link>
            <Link href="/auth/signup">
              <Button variant="outline" size="lg" className="px-8 py-4 text-lg">
                Sign Up
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
