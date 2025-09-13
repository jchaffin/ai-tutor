'use client'

import React, { useRef, useState, useEffect, useMemo } from 'react'
import { Send, Volume2, VolumeX, Mic, X, History, Play, Square } from 'lucide-react'
import { useTranscript } from '@/contexts/TranscriptContext'
import { useRealtimeSession } from '@/hooks/useRealtimeSession'
import { useHandleSessionHistory } from '@/hooks/useHandleSessionHistory'
import { createTutorAgent } from '@/lib/agents/tutorAgent'
import { createCitationResearchAgent } from '@/lib/agents/citationAgent'
import { SessionStatus, PDFAnnotation } from '@/types'
import ReactMarkdown from "react-markdown"
import { Button } from '@/components/ui/Button'

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
  onNewSession?: () => void
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
  documentId,
  onNewSession
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

  // Helper to get all messages including transcript items
  const getAllMessages = () => {
    const allMessages = [...messages];
    
    // Add transcript items that aren't already in messages
    transcriptItems.forEach(item => {
      if (item.type === 'MESSAGE' && !item.isHidden && (item.role === 'user' || item.role === 'assistant')) {
        const existingMessage = allMessages.find(msg => msg.id === (item as any).itemId);
        if (!existingMessage && (item as any).title) {
          allMessages.push({
            id: (item as any).itemId || Date.now().toString(),
            role: item.role as 'user' | 'assistant',
            content: (item as any).title,
            timestamp: new Date()
          });
        }
      }
    });
    
    return allMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  };

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

  // Delete a specific chat
  const deleteChat = async (chatId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent loading the chat when clicking delete
    try {
      const response = await fetch(`/api/chat/${documentId}/history/${chatId}/delete`, {
        method: 'DELETE'
      });
      if (response.ok) {
        // Refresh the chat history to remove the deleted item
        await fetchChatHistory();
      }
    } catch (error) {
      console.error('Error deleting chat:', error);
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

  // Listen to tutor transcript deltas for real-time annotation (normalized)
  useEffect(() => {
    const handleTutorTranscript = (event: any) => {
      const detail = event?.detail || {};
      const transcript: string = detail.delta || detail.transcript || '';
      if (!transcript || typeof transcript !== 'string') return;

      console.log('🎤 Tutor transcript delta:', transcript);

      // Accumulate buffer and trigger throttled semantic search updates tied to speech
      try {
        const trimmed = transcript.trim();
        if (trimmed) {
          const needsSpace = speechBufferRef.current && !/\s$/.test(speechBufferRef.current || '');
          speechBufferRef.current = (speechBufferRef.current || '') + (needsSpace ? ' ' : '') + trimmed;
          const endsSentence = /[.!?]$/.test(trimmed);
          if ((speechBufferRef.current || '').length >= 40 || endsSentence) {
            scheduleSemanticUpdate();
          }
        }
        // On utterance completion, do a final update and reset buffer
        const isComplete = !!detail.isComplete || !!detail.isUtterance;
        if (isComplete) {
          const finalQ = (speechBufferRef.current || '').trim();
          if (finalQ.length >= 20) runSemanticSearch(finalQ);
          speechBufferRef.current = '';
        }
      } catch (e) {
        console.warn('Semantic buffering failed:', e);
      }
      
      // Analyze the speech for citation patterns
      const citationMatches = transcript.match(/\[(\d+)\]|([A-Z][a-z]+\s+et\s+al\.?,?\s+\d{4})|([A-Z][a-z]+,?\s+\d{4})/g);
      if (citationMatches) {
        citationMatches.forEach(citation => {
          console.log('📚 Detected citation in speech:', citation);
          window.dispatchEvent(new CustomEvent('tutor-citation-research', {
            detail: { 
              citation: citation.trim(),
              context: transcript,
              requestId: `speech-citation-${Date.now()}`
            }
          }));
        });
      }

      // Analyze speech for table/figure references
      const tableMatches = transcript.match(/Table\s+\d+/gi);
      if (tableMatches) {
        tableMatches.forEach(table => {
          console.log('📊 Detected table reference in speech:', table);
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('tutor-circle-table', {
              detail: { label: table.trim() }
            }));
          }, 200);
        });
      }

      const figureMatches = transcript.match(/Figure\s+\d+/gi);
      if (figureMatches) {
        figureMatches.forEach(figure => {
          console.log('📈 Detected figure reference in speech:', figure);
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('tutor-circle-figure', {
              detail: { label: figure.trim() }
            }));
          }, 200);
        });
      }

      // Analyze speech for direct quotes (text in quotes)
      const quoteMatches = transcript.match(/"([^"]+)"/g);
      if (quoteMatches) {
        quoteMatches.forEach(quote => {
          const cleanQuote = quote.replace(/\"/g, '').replace(/"/g, '').trim();
          if (cleanQuote.length > 10) {
            console.log('💬 Detected quote in speech:', cleanQuote);
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('tutor-highlight-quote', {
                detail: { text: cleanQuote }
              }));
            }, 300);
          }
        });
      }
    };

    window.addEventListener('tutor-transcript-delta', handleTutorTranscript);
    return () => {
      window.removeEventListener('tutor-transcript-delta', handleTutorTranscript);
    };
  }, []);

  // Handle citation research requests
  useEffect(() => {
    const handleCitationResearch = (event: Event) => {
      const { citation, context, requestId } = (event as CustomEvent).detail || {};
      console.log('📚 Citation research request received:', { citation, context, requestId });
      
      if (!citation) {
        console.warn('📚 No citation provided for research');
        return;
      }

      try {
        // Add a message to show research is starting
        const researchMessage: Message = {
          id: `citation-research-${Date.now()}`,
          role: 'assistant',
          content: `🔍 Researching citation: ${citation}...`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, researchMessage]);

        // Simulate citation research (in a real implementation, this would use the citation agent)
        setTimeout(() => {
          const resultMessage: Message = {
            id: `citation-result-${Date.now()}`,
            role: 'assistant',
            content: `📚 **Citation Research Results for: ${citation}**\n\nThis citation appears to reference an academic paper. Based on the context: "${context || 'No context provided'}"\n\n*Note: This is a placeholder implementation. In a full system, this would search academic databases to provide detailed information about the referenced paper, including authors, title, abstract, and relevance to the current document.*\n\n**Next steps:** You could ask me to explain how this citation relates to the current document, or ask about other citations you're interested in.`,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, resultMessage]);
        }, 2000);

      } catch (error) {
        console.error('📚 Error handling citation research:', error);
        const errorMessage: Message = {
          id: `citation-error-${Date.now()}`,
          role: 'assistant',
          content: `❌ Sorry, I encountered an error while researching the citation: ${citation}`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    };

    window.addEventListener('tutor-citation-research', handleCitationResearch);
    return () => {
      window.removeEventListener('tutor-citation-research', handleCitationResearch);
    };
  }, [setMessages]);

  const fetchEphemeralKey = async (): Promise<string | null> => {
    try {
      console.log("🔑 Attempting to fetch ephemeral key...");
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      console.log("🔑 Response status:", response.status, response.statusText);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`❌ Failed to get ephemeral key: ${response.status} ${response.statusText}`, errorData);
        
        // More specific error messages
        if (response.status === 500) {
          console.error("❌ Server error - check OpenAI API key configuration");
        } else if (response.status === 401) {
          console.error("❌ Authentication error - session may be expired");
        } else if (response.status === 429) {
          console.error("❌ Rate limited - too many requests to OpenAI API");
        }
        
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
      // Clear transcript before connecting to ensure clean state
      console.log("🧹 Clearing transcript before connecting...")
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

      const tutorAgent = createTutorAgent(safeTitle, pdfContent, documentId)
      
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
        console.log("🤖 Triggering agent introduction...");
        updateSession(true);
        
        // Also send a direct response.create event as backup
        setTimeout(() => {
          try {
            console.log("🤖 Backup: Sending response.create event...");
            sendEvent({ type: "response.create" });
          } catch (err) {
            console.error("❌ Failed to send backup response.create:", err);
          }
        }, 1000);
        
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

  // Dynamic semantic-highlighting state for tutor speech
  const speechBufferRef = useRef<string>('')
  const semanticTimerRef = useRef<number | null>(null)

  const runSemanticSearch = async (query: string) => {
    try {
      const q = (query || '').trim()
      if (q.length < 20) return
      const res = await fetch('/api/realtime/semantic-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          documentId,
          sessionId: `agent-${Date.now()}`,
          utteranceId: `agent-utt-${Date.now()}`,
        }),
      })
      if (!res.ok) return
      const data = await res.json()
      let results: Array<any> = Array.isArray(data?.results) ? data.results : []

      // Prefer highlighting within the active section/page range if provided by the viewer
      try {
        const active: any = (window as any).__activeSection
        if (active && (typeof active.startPage === 'number' || typeof active.endPage === 'number' || typeof active.page === 'number')) {
          const start = Number(active.startPage ?? active.page ?? active.start ?? 1)
          const end = Number(active.endPage ?? active.page ?? active.end ?? start)
          results = results.filter((r: any) => typeof r?.page === 'number' && r.page >= start && r.page <= end)
        }
      } catch {}

      // Accumulate highlights during an utterance; do NOT clear on every delta
      const top = results.slice(0, 5)
      const stopwords = new Set(['the','and','for','with','this','that','from','are','was','were','been','have','has','had','into','onto','over','very','more','most','such','than','then','also','can','may','might','will','would','could'])
      const keywords = q
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3 && !stopwords.has(w))
        .slice(0, 5)

      top.forEach((r: any) => {
        const raw = typeof r?.text === 'string' ? r.text : ''
        if (!raw) return
        const normalized = raw.replace(/\s+/g, ' ').trim()
        // Prefer a longer snippet around a keyword to maximize perceived coverage
        let best = normalized.slice(0, 260)
        for (const kw of keywords) {
          const idx = normalized.toLowerCase().indexOf(kw)
          if (idx >= 0) {
            const start = Math.max(0, idx - 100)
            const end = Math.min(normalized.length, idx + kw.length + 160)
            best = normalized.slice(start, end)
            break
          }
        }
        // Avoid cutting in the middle of words
        best = best.replace(/^\S+\s/, '').replace(/\s\S+$/, '')
        // Dispatch concise, matchable fragment
        window.dispatchEvent(new CustomEvent('tutor-highlight-semantic-fragment', {
          detail: { text: best, page: r.page, similarity: r.similarity, query: q },
        }))
      })
    } catch (e) {
      console.error('🔍 Semantic highlight error:', e)
    }
  }

  const scheduleSemanticUpdate = () => {
    try { if (semanticTimerRef.current) window.clearTimeout(semanticTimerRef.current) } catch {}
    semanticTimerRef.current = window.setTimeout(() => {
      const q = (speechBufferRef.current || '').trim()
      if (q.length >= 20) runSemanticSearch(q)
    }, 600)
  }

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
      {/* Connect Button */}
      <div className="chat-connect border-b p-4 flex-shrink-0">
        <div className="flex items-center justify-center gap-4">
          <Button
            onClick={async () => {
              try {
                if (sessionStatus === 'CONNECTED') {
                  // Archive current chat before disconnecting
                  const allMessages = getAllMessages();
                  if (allMessages.length > 0) {
                    try {
                      const response = await fetch('/api/chat/archive', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          documentId: documentId,
                          messages: allMessages,
                          timestamp: new Date().toISOString(),
                        }),
                      });
                      if (!response.ok && process.env.NODE_ENV !== 'production') {
                        console.error('❌ Failed to archive chat on disconnect');
                      }
                      try { await fetchChatHistory(); } catch {}
                      // Clear transcript first, then clear messages to ensure proper cleanup order
                      console.log("🧹 Clearing transcript and messages on disconnect...")
                      clearTranscript();
                      setMessages([]);
                    } catch (e) {
                      console.error('❌ Archive on disconnect failed:', e);
                    }
                  }
                  await disconnectFromRealtime();
                  return;
                }
                // Archive current chat to database if there are messages, then start a fresh session
                const allMessages = getAllMessages();
                if (allMessages.length > 0) {
                  const response = await fetch('/api/chat/archive', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      documentId: documentId,
                      messages: allMessages,
                      timestamp: new Date().toISOString()
                    }),
                  });
                  if (!response.ok && process.env.NODE_ENV !== 'production') {
                    console.error('❌ Failed to archive chat');
                  }
                  // Refresh history immediately so the archived chat appears
                  try { await fetchChatHistory(); } catch {}
                }
                setMessages([]);
                clearTranscript();
                try { onNewSession && onNewSession(); } catch {}
                await connectToRealtime();
              } catch (error) {
                console.error('❌ Toggle connect error:', error);
              }
            }}
            disabled={sessionStatus === 'CONNECTING'}
            variant="default"
            size="lg"
            className="rounded-full"
            title={sessionStatus === 'CONNECTED' ? 'Disconnect from AI tutor' : 'Start new chat and connect to AI tutor'}
          >
            {sessionStatus === 'CONNECTED' ? (
              <>
                <Square />
                Disconnect
              </>
            ) : sessionStatus === 'CONNECTING' ? (
              'Connecting…'
            ) : (
              <>
                <Play />
                Connect
              </>
            )}
          </Button>

          {/* Chat History Icon Button */}
          <Button
            onClick={() => {
              setShowChatHistory(!showChatHistory);
              if (!showChatHistory) {
                fetchChatHistory();
              }
            }}
            variant="default"
            size="icon"
            className="rounded-full"
            title="View chat history"
          >
            <History />
          </Button>
        </div>
        

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
                    className="p-3 mb-2 bg-white rounded-lg border cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-colors relative group"
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
                    <button
                      onClick={(e) => deleteChat(chat.id, e)}
                      className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete chat"
                    >
                      ×
                    </button>
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
                      className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                        message.role === 'user'
                          ? 'bg-[var(--secondary)] text-white'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      <div className="text-sm">{message.content}</div>
                      <div className={`text-xs mt-1 ${
                        message.role === 'user' ? 'text-gray-300' : 'text-gray-500'
                      }`}>
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
                        <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                          isUser 
                            ? "bg-[var(--secondary)] text-white" 
                            : "bg-gray-100 text-gray-600"
                        }`}>
                          <div className="text-sm">{item.title}</div>
                          <div className={`text-xs mt-1 ${
                            isUser ? 'text-gray-300' : 'text-gray-500'
                          }`}>{item.timestamp}</div>
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

      {/* Input Form - FIXED, CONSTRAINED TO CHAT PANE - Only show when connected */}
      {sessionStatus === 'CONNECTED' && (
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
            <Button
              type="submit"
              disabled={!inputMessage.trim() || isLoading}
              variant="default"
            >
              Send
            </Button>
          </form>
        </div>
      )}
    </div>
  )
}
