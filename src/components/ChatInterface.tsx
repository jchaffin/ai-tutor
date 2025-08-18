'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Mic, MicOff, Volume2, VolumeX } from 'lucide-react'
import { useRealtimeSession } from '@/hooks/useRealtimeSession'
import { fetchEphemeralKey, createAudioElement, destroyAudioElement } from '@/lib/voiceUtils'
import { createTutorAgent } from '@/lib/agents/tutorAgent'
import { SessionStatus, TutorMessage, PDFAnnotation } from '@/types'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface ChatInterfaceProps {
  messages: Message[]
  onSendMessage: (message: string) => void
  onAnnotationCreated?: (annotation: PDFAnnotation) => void
  onPageNavigation?: (page: number) => void
  isLoading?: boolean
  pdfTitle?: string
  pdfContent?: string
  currentPage?: number
}

export default function ChatInterface({ 
  messages, 
  onSendMessage, 
  onAnnotationCreated,
  onPageNavigation,
  isLoading = false,
  pdfTitle = '',
  pdfContent = '',
  currentPage = 1
}: ChatInterfaceProps) {
  const [inputMessage, setInputMessage] = useState('')
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('DISCONNECTED')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const audioElementRef = useRef<HTMLAudioElement | null>(null)

  // Initialize realtime session
  const realtimeSession = useRealtimeSession({
    onConnectionChange: (status) => {
      setSessionStatus(status)
    },
    onMessageReceived: (message) => {
      // Handle realtime messages from the AI
      onSendMessage(message.content)
    },
    onAnnotationCreated: onAnnotationCreated,
    onPageNavigation: onPageNavigation,
  })

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Initialize audio element
  useEffect(() => {
    if (typeof window !== 'undefined' && !audioElementRef.current) {
      audioElementRef.current = createAudioElement()
    }

    return () => {
      if (audioElementRef.current) {
        destroyAudioElement(audioElementRef.current)
      }
    }
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputMessage.trim() && !isLoading) {
      onSendMessage(inputMessage.trim())
      setInputMessage('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const connectToVoice = async () => {
    if (sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING") {
      return;
    }

    try {
      console.log("Fetching ephemeral key...");
      const ephemeralKey = await fetchEphemeralKey();
      if (!ephemeralKey) {
        console.error("No ephemeral key received");
        return;
      }
      console.log("Ephemeral key received successfully");

      if (!audioElementRef.current) {
        console.error("Audio element not available");
        return;
      }

      const tutorAgent = createTutorAgent(pdfTitle, pdfContent)
      
      await realtimeSession.connect({
        getEphemeralKey: () => Promise.resolve(ephemeralKey),
        initialAgent: tutorAgent,
        audioElement: audioElementRef.current,
        pdfContext: pdfContent,
        currentPage
      })
      
      setVoiceEnabled(true)
      console.log("✅ Voice connection successful");
    } catch (error) {
      console.error("❌ Voice connection failed:", error);
    }
  }

  const disconnectFromVoice = async () => {
    try {
      await realtimeSession.disconnect()
      setVoiceEnabled(false)
      console.log("✅ Voice disconnected");
    } catch (error) {
      console.error('Error disconnecting voice:', error);
    }
  }

  const toggleVoiceMode = async () => {
    if (!voiceEnabled) {
      await connectToVoice()
    } else {
      await disconnectFromVoice()
    }
  }

  const handlePushToTalk = (pressed: boolean) => {
    if (pressed) {
      realtimeSession.pushToTalkStart()
    } else {
      realtimeSession.pushToTalkStop()
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Chat Header */}
      <div className="p-4 bg-gray-50 border-b">
        <h3 className="text-lg font-semibold text-gray-900">AI Tutor Chat</h3>
        <p className="text-sm text-gray-600">Ask questions about your PDF document</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <div className="text-4xl mb-2">💬</div>
            <p>Start a conversation about your PDF!</p>
            <p className="text-sm mt-1">Ask questions like "What is this document about?" or "Explain the main concepts"</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  message.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                <div className="text-sm leading-relaxed whitespace-pre-wrap">
                  {message.content}
                </div>
                <div className={`text-xs mt-1 ${
                  message.role === 'user' ? 'text-indigo-200' : 'text-gray-500'
                }`}>
                  {formatTime(message.timestamp)}
                </div>
              </div>
            </div>
          ))
        )}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-4 py-2">
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="p-4 border-t bg-gray-50">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <div className="flex-1">
            <textarea
              ref={inputRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your PDF..."
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              rows={1}
              style={{ minHeight: '40px', maxHeight: '120px' }}
              disabled={isLoading}
            />
          </div>
          
          <button
            type="button"
            onClick={toggleVoiceMode}
            className={`p-2 rounded-lg transition-colors ${
              voiceEnabled 
                ? 'bg-green-500 text-white hover:bg-green-600' 
                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            }`}
            title={voiceEnabled ? 'Disable voice mode' : 'Enable voice mode'}
            disabled={sessionStatus === 'CONNECTING'}
          >
            {voiceEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>

          {voiceEnabled && (
            <button
              type="button"
              onMouseDown={() => handlePushToTalk(true)}
              onMouseUp={() => handlePushToTalk(false)}
              onMouseLeave={() => handlePushToTalk(false)}
              className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              title="Hold to talk"
            >
              <Mic size={20} />
            </button>
          )}
          
          <button
            type="submit"
            disabled={!inputMessage.trim() || isLoading}
            className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Send message"
          >
            <Send size={20} />
          </button>
        </form>
      </div>
    </div>
  )
}
