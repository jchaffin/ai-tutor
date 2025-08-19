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
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void
  documentId: string
}

export default function ChatInterface({ 
  messages, 
  onSendMessage, 
  onAnnotationCreated,
  onPageNavigation,
  isLoading = false,
  pdfTitle = '',
  pdfContent = '',
  currentPage = 1,
  setMessages,
  documentId
}: ChatInterfaceProps) {
  const [inputMessage, setInputMessage] = useState('')
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('DISCONNECTED')
  const [isAudioPlaybackEnabled, setIsAudioPlaybackEnabled] = useState(true)
  const [showChatHistory, setShowChatHistory] = useState(false)
  const [chatHistory, setChatHistory] = useState<Array<{id: string, timestamp: string, messageCount: number}>>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const audioElementRef = useRef<HTMLAudioElement | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [fixedInputStyle, setFixedInputStyle] = useState<React.CSSProperties>({})

  // Keep fixed input aligned to chat pane width/position
  useEffect(() => {
    const update = () => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setFixedInputStyle({ left: `${rect.left}px`, width: `${rect.width}px` })
    }
    update()
    window.addEventListener('resize', update)
    // capture scroll from ancestors too
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [])

  // Use transcript context for real-time message handling
  const { transcriptItems, clearTranscript } = useTranscript()
  
  // Use session history handler to process realtime events
  const sessionHistoryHandler = useHandleSessionHistory()

  // Fetch chat history
  const fetchChatHistory = async () => {
    try {
      setLoadingHistory(true);
      const response = await fetch(`/api/chat/${documentId}/history`);
      if (response.ok) {
        const data = await response.json();
        setChatHistory(data.chats || []);
      }
    } catch (error) {
      console.error('Error fetching chat history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Load a specific chat
  const loadChat = async (chatId: string) => {
    try {
      const response = await fetch(`/api/chat/${documentId}/history/${chatId}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
        setShowChatHistory(false); // Close sidebar after loading
      }
    } catch (error) {
      console.error('Error loading chat:', error);
    }
  };

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
  const { connect, disconnect, mute, sendEvent, sendUserText, interrupt } = useRealtimeSession({
    onConnectionChange: (status) => {
      console.log("🔗 Session status changed:", status);
      setSessionStatus(status as SessionStatus)
    },
  })

  // No auto-scroll - let users control their own scroll position
  // Users can scroll up to view history, new messages appear at bottom

  // Monitor scroll position to show/hide scroll to bottom button
  useEffect(() => {
    const messagesContainer = document.querySelector('.chat-messages') as HTMLElement;
    if (!messagesContainer) return;

    const handleScroll = () => {
      const isNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
      setShowScrollToBottom(!isNearBottom);
    };

    messagesContainer.addEventListener('scroll', handleScroll);
    return () => messagesContainer.removeEventListener('scroll', handleScroll);
  }, []);

  // Function to scroll to bottom (manual control)
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

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

      console.log("🤖 Creating tutor agent with:", {
        pdfTitle: pdfTitle,
        pdfContentLength: pdfContent?.length || 0,
        pdfTitleType: typeof pdfTitle,
        pdfTitleValue: pdfTitle
      });

      // Ensure we have a valid title
      const safeTitle = pdfTitle && pdfTitle.trim() ? pdfTitle.trim() : 'PDF Document';
      console.log("🤖 Using safe title:", safeTitle);

      const tutorAgent = createTutorAgent(safeTitle, pdfContent)
      
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
      
      // Enable transcription immediately and trigger greeting
      try {
        updateSession(true);
      } catch (error) {
        console.error("❌ Failed to start transcription:", error);
      }
      
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
      // If voice session is connected, forward the text into the conversation and trigger response
      if (sessionStatus === 'CONNECTED') {
        try {
          // stop any ongoing assistant speech first
          try { interrupt() } catch {}
          sendUserText(inputMessage.trim())
          sendEvent({ type: 'response.create' })
        } catch (err) {
          console.error('❌ Failed to send text to voice session:', err)
        }
      }
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

  // Detect references like "Table 1" (optionally with a page mention) in assistant outputs
  const lastProcessedMsgIdRef = useRef<string | null>(null)
  const lastProcessedTranscriptIdRef = useRef<string | null>(null)

  const wordsToNumber = (word: string): number | null => {
    const map: Record<string, number> = {
      one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
      eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
      first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10
    }
    return map[word.toLowerCase()] ?? null
  }

  const extractPageNumber = (text: string): number | undefined => {
    // Try explicit digits after "page"
    const m1 = text.match(/page\s*(\d+)/i)
    if (m1 && m1[1]) return parseInt(m1[1], 10)
    // Try words like "page three" or ordinals like "third page"
    const m2 = text.match(/page\s*([a-zA-Z]+)/i)
    if (m2 && m2[1]) {
      const n = wordsToNumber(m2[1])
      if (n) return n
    }
    const m3 = text.match(/([a-zA-Z]+)\s*page/i)
    if (m3 && m3[1]) {
      const n = wordsToNumber(m3[1])
      if (n) return n
    }
    return undefined
  }

  const maybeCircleTable = (text: string) => {
    if (!text) return
    const tableMatch = text.match(/table\s*(\d+)/i)
    if (!tableMatch) return
    const tableNum = tableMatch[1]
    const pageNum = extractPageNumber(text)
    try {
      console.log('📤 Dispatching pdf-circle-text', { text: `Table ${tableNum}`, page: pageNum })
      window.dispatchEvent(new CustomEvent('pdf-circle-text', { detail: { text: `Table ${tableNum}`, page: pageNum } }))
    } catch (e) {
      console.warn('Failed to dispatch pdf-circle-text event', e)
    }
  }

  // Watch standard assistant messages
  useEffect(() => {
    if (!messages || messages.length === 0) return
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'assistant') return
    if (lastProcessedMsgIdRef.current === last.id) return
    lastProcessedMsgIdRef.current = last.id
    maybeCircleTable(last.content)
  }, [messages])

  // Watch real-time transcript assistant items
  useEffect(() => {
    if (!transcriptItems || transcriptItems.length === 0) return
    const items = transcriptItems.filter((i) => i.type === 'MESSAGE' && !i.isHidden && i.role === 'assistant')
    if (items.length === 0) return
    const last = items[items.length - 1]
    if (lastProcessedTranscriptIdRef.current === (last as any).itemId) return
    lastProcessedTranscriptIdRef.current = (last as any).itemId
    maybeCircleTable((last as any).title || '')
  }, [transcriptItems])

  return (
    <div ref={containerRef} className="chat-interface-container h-full bg-white flex flex-col overflow-hidden relative">
      {/* Header - GLUED TO TOP */}
      <div className="chat-header bg-white border-b p-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">AI Tutor Chat</h2>
            <p className="text-sm text-gray-600">Ask questions about your PDF document</p>
          </div>
        </div>
      </div>

      {/* Connect Button */}
      <div className="chat-connect bg-blue-50 border-b p-4 flex-shrink-0">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={async () => {
              try {
                if (sessionStatus === 'CONNECTED') {
                  await disconnectFromRealtime();
                  return;
                }
                // Archive current chat to database if there are messages, then start a fresh session
                if (messages.length > 0) {
                  const response = await fetch('/api/chat/archive', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      documentId: documentId,
                      messages: messages,
                      timestamp: new Date().toISOString()
                    }),
                  });
                  if (!response.ok && process.env.NODE_ENV !== 'production') {
                    console.error('❌ Failed to archive chat');
                  }
                }
                setMessages([]);
                clearTranscript();
                await connectToRealtime();
              } catch (error) {
                console.error('❌ Toggle connect error:', error);
              }
            }}
            disabled={sessionStatus === 'CONNECTING'}
            className={`px-6 py-3 rounded-lg font-medium ${
              sessionStatus === 'CONNECTED'
                ? 'bg-red-500 text-white hover:bg-red-600'
                : sessionStatus === 'CONNECTING'
                ? 'bg-yellow-500 text-white cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
            title={sessionStatus === 'CONNECTED' ? 'Disconnect from AI tutor' : 'Start new chat and connect to AI tutor'}
          >
            {sessionStatus === 'CONNECTED' ? 'Disconnect' : sessionStatus === 'CONNECTING' ? 'Connecting…' : 'New Chat & Connect'}
          </button>

          {/* Chat History Button */}
          <button
            onClick={() => {
              setShowChatHistory(!showChatHistory);
              if (!showChatHistory) {
                fetchChatHistory();
              }
            }}
            className={`px-4 py-3 rounded-lg font-medium ${
              showChatHistory 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-500 text-white hover:bg-gray-600'
            }`}
            title="View chat history"
          >
            {showChatHistory ? 'Hide History' : 'Chat History'}
          </button>
        </div>
        
        <p className="text-center text-sm text-gray-600 mt-2">
          {sessionStatus === 'CONNECTED' ? '✓ You can now speak with your AI tutor!' : 'Click to start a voice conversation'}
        </p>
      </div>

      {/* Main Content Area with Chat History Sidebar */}
      <div className="flex-1 flex min-h-0">
        {/* Chat History Sidebar */}
        {showChatHistory && (
          <div className="w-64 border-r bg-gray-50 overflow-y-auto flex-shrink-0">
            <div className="p-4 border-b bg-white">
              <h3 className="font-semibold text-gray-900">Chat History</h3>
              <p className="text-sm text-gray-600">Previous conversations</p>
            </div>
            <div className="p-2">
              {loadingHistory ? (
                <div className="text-center text-gray-500 py-4">Loading...</div>
              ) : chatHistory.length === 0 ? (
                <div className="text-center text-gray-500 py-4">No previous chats</div>
              ) : (
                chatHistory.map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => loadChat(chat.id)}
                    className="p-3 mb-2 bg-white rounded-lg border cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-colors"
                  >
                    <div className="text-sm font-medium text-gray-900">
                      {new Date(chat.timestamp).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(chat.timestamp).toLocaleTimeString()}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {chat.messageCount} messages
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Messages column */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className={`chat-messages flex-1 min-h-0 overflow-y-auto p-4 space-y-4 pb-36 ${showChatHistory ? '' : ''}`}>
            {messages.length === 0 && transcriptItems.length === 0 ? (
              <div className="text-center text-gray-500 mt-8">
                <p>Start a conversation about your PDF!</p>
              </div>
            ) : (
              <>
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
                      <div className="text-sm">{message.content}</div>
                      <div className="text-xs mt-1 text-gray-500">
                        {formatTime(message.timestamp)}
                      </div>
                    </div>
                  </div>
                ))}
                
                {transcriptItems
                  .filter(item => item.type === 'MESSAGE' && !item.isHidden)
                  .map((item) => {
                    const isUser = item.role === "user"
                    return (
                      <div key={item.itemId} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-lg px-4 py-2 ${
                          isUser 
                            ? "bg-indigo-600 text-white" 
                            : "bg-green-100 text-gray-900"
                        }`}>
                          <div className="text-sm">{item.title}</div>
                          <div className="text-xs mt-1 text-gray-500">{item.timestamp}</div>
                        </div>
                      </div>
                    )
                  })}
              </>
            )}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-lg px-4 py-2">
                  <div className="text-sm">Loading...</div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Scroll to Bottom Button */}
          {showScrollToBottom && (
            <div className="absolute bottom-36 right-4 z-20">
              <button
                onClick={scrollToBottom}
                className="bg-indigo-600 text-white rounded-full p-3 shadow-lg hover:bg-indigo-700 transition-colors"
                title="Scroll to latest messages"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Input Form - FIXED, CONSTRAINED TO CHAT PANE */}
      <div className="chat-input fixed bottom-0 bg-gray-50 border-t p-4 z-30" style={fixedInputStyle}>
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your PDF..."
            className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            rows={1}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!inputMessage.trim() || isLoading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  )
}
