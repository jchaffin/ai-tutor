'use client'

import React, { useRef, useState, useEffect, useMemo } from 'react'
import { Send, Volume2, VolumeX, Mic } from 'lucide-react'
import { useTranscript } from '@/contexts/TranscriptContext'
import { useRealtimeSession } from '@/hooks/useRealtimeSession'
import { useHandleSessionHistory } from '@/hooks/useHandleSessionHistory'
import { createTutorAgent } from '@/lib/agents/tutorAgent'
import { SessionStatus, PDFAnnotation } from '@/types'
import ReactMarkdown from "react-markdown"

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
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('DISCONNECTED')
  const [isAudioPlaybackEnabled, setIsAudioPlaybackEnabled] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const audioElementRef = useRef<HTMLAudioElement | null>(null)

  // Use transcript context for real-time message handling
  const { transcriptItems, clearTranscript } = useTranscript()
  
  // Use session history handler to process realtime events
  const sessionHistoryHandler = useHandleSessionHistory()

  // Create audio element
  const sdkAudioElement = useMemo(() => {
    if (typeof window === 'undefined') return undefined
    const el = document.createElement('audio')
    el.autoplay = true
    el.muted = false
    el.volume = 1.0
    el.style.display = 'none'
    document.body.appendChild(el)
    
    // Add event listeners to debug audio
    el.addEventListener('loadedmetadata', () => {
      console.log("🎵 Audio metadata loaded");
    });
    
    el.addEventListener('play', () => {
      console.log("🎵 Audio started playing");
    });
    
    el.addEventListener('error', (e) => {
      console.error("🎵 Audio error:", e);
    });
    
    console.log("🎵 Audio element created:", el);
    return el
  }, [])

  // Attach audio element
  useEffect(() => {
    if (sdkAudioElement && !audioElementRef.current) {
      audioElementRef.current = sdkAudioElement
    }
  }, [sdkAudioElement])

  // Initialize realtime session
  const { connect, disconnect, mute, sendEvent } = useRealtimeSession({
    onConnectionChange: (status) => {
      console.log("🔗 Session status changed:", status);
      setSessionStatus(status as SessionStatus)
    },
  })

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, transcriptItems])

  const fetchEphemeralKey = async (): Promise<string | null> => {
    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`Failed to get ephemeral key: ${response.status} ${response.statusText}`, errorData);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (!data.ephemeralKey) {
        console.error('No ephemeral key in response:', data);
        throw new Error('No ephemeral key received from server');
      }
      
      console.log('✅ Ephemeral key fetched successfully');
      return data.ephemeralKey;
    } catch (error) {
      console.error('❌ Error fetching ephemeral key:', error);
      return null;
    }
  };

  const connectToRealtime = async () => {
    if (sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING") {
      return
    }

    try {
      clearTranscript()
      console.log("🔑 Fetching ephemeral key...")
      const ephemeralKey = await fetchEphemeralKey()
      if (!ephemeralKey) {
        console.error("❌ Failed to get ephemeral key, cannot connect to voice")
        setSessionStatus('DISCONNECTED')
        return
      }
      console.log("🔑 Ephemeral key received successfully")

      if (!audioElementRef.current) {
        console.error("Audio element not available")
        return
      }

      // Ensure audio element is ready
      audioElementRef.current.muted = false
      audioElementRef.current.volume = 1.0
      console.log("🎵 Audio element ready for connection")

      const tutorAgent = createTutorAgent(pdfTitle, pdfContent)
      
      await connect({
        getEphemeralKey: () => Promise.resolve(ephemeralKey),
        initialAgents: [tutorAgent],
        audioElement: audioElementRef.current,
        extraContext: {
          pdfContext: pdfContent,
          currentPage
        },
        outputGuardrails: []
      })
      
      console.log("✅ Voice connection successful")
      
      // Trigger initial greeting after connection is established
      setTimeout(() => {
        console.log("🎤 Triggering initial greeting");
        console.log("🎤 Session status:", sessionStatus);
        console.log("🎤 Audio element:", audioElementRef.current);
        updateSession(true);
      }, 1000);
      
    } catch (error) {
      console.error("❌ Voice connection failed:", error)
    }
  }

  const disconnectFromRealtime = async () => {
    try {
      await disconnect()
      console.log("✅ Voice disconnected")
    } catch (error) {
      console.error('Error disconnecting voice:', error)
    }
  }

  const updateSession = (shouldTriggerResponse: boolean = false) => {
    console.log("🔧 Updating session with shouldTriggerResponse:", shouldTriggerResponse);
    console.log("🔧 Audio playback enabled:", isAudioPlaybackEnabled);
    
    // Use server-side voice activity detection for continuous listening
    const turnDetection = { type: "server_vad" as const };

    sendEvent({
      type: "session.update",
      session: {
        turn_detection: turnDetection,
        audio_playback: {
          mode: isAudioPlaybackEnabled ? "enabled" : "disabled",
        },
      },
    });

    if (shouldTriggerResponse) {
      console.log("🔧 Triggering response.create");
      sendEvent({ type: "response.create" });
    }
  };

  const onToggleConnection = async () => {
    if (sessionStatus === "CONNECTED") {
      await disconnectFromRealtime()
    } else {
      await connectToRealtime()
    }
  }

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

  const formatTime = (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    if (!dateObj || isNaN(dateObj.getTime())) {
      return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Handle audio playback settings
  useEffect(() => {
    if (audioElementRef.current) {
      if (isAudioPlaybackEnabled) {
        audioElementRef.current.muted = false
        audioElementRef.current.volume = 1.0
      } else {
        audioElementRef.current.muted = true
      }
    }

    try {
      mute(!isAudioPlaybackEnabled)
    } catch {}
  }, [isAudioPlaybackEnabled, mute])

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Chat Header */}
      <div className="p-4 bg-gray-50 border-b">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">AI Tutor Chat</h3>
            <p className="text-sm text-gray-600">Ask questions about your PDF document</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-gray-400"></div>
            <span className="text-sm text-gray-600">Voice Disconnected</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && transcriptItems.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <div className="text-4xl mb-2">💬</div>
            <p>Start a conversation about your PDF!</p>
            <p className="text-sm mt-1">Ask questions like &quot;What is this document about?&quot; or &quot;Explain the main concepts&quot;</p>
          </div>
        ) : (
          <>
            {/* Show persistent messages */}
            {messages.map((message) => (
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
            ))}
            
            {/* Show real-time transcript items */}
            {transcriptItems
              .filter(item => item.type === 'MESSAGE' && !item.isHidden)
              .sort((a, b) => a.createdAtMs - b.createdAtMs)
              .map((item) => {
                const isUser = item.role === "user"
                const title = item.title || ""
                const displayTitle = title.startsWith("[") && title.endsWith("]") 
                  ? title.slice(1, -1) 
                  : title

                return (
                  <div key={item.itemId} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      isUser 
                        ? "bg-indigo-600 text-white" 
                        : "bg-green-100 text-gray-900 border-l-4 border-green-500"
                    }`}>
                      <div className="text-sm leading-relaxed whitespace-pre-wrap">
                        <ReactMarkdown>{displayTitle}</ReactMarkdown>
                      </div>
                      <div className={`text-xs mt-1 flex items-center gap-2 ${
                        isUser ? "text-indigo-200" : "text-gray-500"
                      }`}>
                        <span>{item.timestamp}</span>
                        {item.status === 'IN_PROGRESS' && (
                          <span className="text-blue-500">●</span>
                        )}
                        <span className="text-xs bg-green-200 text-green-800 px-1 rounded">
                          Voice
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
          </>
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
            onClick={onToggleConnection}
            className={`p-2 rounded-lg transition-colors ${
              sessionStatus === 'CONNECTED'
                ? 'bg-green-500 text-white hover:bg-green-600' 
                : sessionStatus === 'CONNECTING'
                ? 'bg-yellow-500 text-white'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
            title={sessionStatus === 'CONNECTED' ? 'Connected - Click to disconnect' : 'Connect voice'}
          >
            <Mic size={20} />
          </button>

          <button
            type="button"
            onClick={() => setIsAudioPlaybackEnabled(!isAudioPlaybackEnabled)}
            className={`p-2 rounded-lg transition-colors ${
              isAudioPlaybackEnabled 
                ? 'bg-green-500 text-white hover:bg-green-600' 
                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            }`}
            title={isAudioPlaybackEnabled ? 'Mute audio' : 'Enable audio'}
          >
            {isAudioPlaybackEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>

          {sessionStatus === 'CONNECTED' && (
            <div className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 rounded-lg text-xs">
              <Mic size={14} />
              <span>Listening</span>
            </div>
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