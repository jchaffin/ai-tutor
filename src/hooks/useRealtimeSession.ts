import { useCallback, useRef, useState, useEffect } from 'react';
import {
  RealtimeSession,
  RealtimeAgent,
  OpenAIRealtimeWebRTC,
} from '@openai/agents/realtime';

import { audioFormatForCodec, applyCodecPreferences } from '@/lib/codecUtils';
import { useEvent } from '@/contexts/EventContext';
import { useHandleSessionHistory } from './useHandleSessionHistory';
import { SessionStatus } from '@/types';

// Trigger semantic search for tutor utterances
async function triggerSemanticSearch(utterance: string, sessionId?: string, utteranceId?: string) {
  try {
    // Get current document ID from URL or global state
    const documentId = (window as any).__currentDocumentId || 
                      window.location.pathname.split('/').pop();
    
    if (!documentId) return;
    
    console.log(`🔍 Triggering real-time semantic search for: "${utterance}"`);
    
    const response = await fetch('/api/realtime/semantic-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        query: utterance, 
        documentId,
        sessionId: sessionId || `session-${Date.now()}`,
        utteranceId: utteranceId || `utterance-${Date.now()}`
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.results && data.results.length > 0) {
        console.log(`🔍 Found ${data.results.length} semantic matches for "${utterance}"`);
        
        // Dispatch semantic fragment events for each result
        data.results.forEach((result: any, index: number) => {
          if (result.text && result.text.length > 10) {
            // Add a small delay to stagger highlights for better visual effect
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('tutor-highlight-semantic-fragment', {
                detail: {
                  text: result.text,
                  page: result.page,
                  similarity: result.similarity,
                  query: utterance,
                  sessionId: data.sessionId,
                  utteranceId: data.utteranceId,
                  chunkId: result.chunkId,
                  startIndex: result.startIndex,
                  endIndex: result.endIndex,
                  highlightIndex: index
                }
              }));
            }, index * 200); // 200ms delay between highlights
          }
        });
        
        // Dispatch a summary event for the UI
        window.dispatchEvent(new CustomEvent('semantic-search-completed', {
          detail: {
            query: utterance,
            resultsCount: data.results.length,
            sessionId: data.sessionId,
            utteranceId: data.utteranceId,
            timestamp: data.timestamp
          }
        }));
      } else {
        console.log(`🔍 No semantic matches found for "${utterance}"`);
      }
    } else {
      console.log("🔍 Semantic search API error:", response.status);
    }
  } catch (error) {
    console.log("🔍 Real-time semantic search failed:", error);
  }
}

export interface RealtimeSessionCallbacks {
  onConnectionChange?: (status: SessionStatus) => void;
  onAgentHandoff?: (agentName: string) => void;
}

export interface ConnectOptions {
  getEphemeralKey: () => Promise<string>;
  initialAgents: RealtimeAgent[];
  audioElement?: HTMLAudioElement;
  extraContext?: Record<string, any>;
  outputGuardrails?: any[];
}

export function useRealtimeSession(callbacks: RealtimeSessionCallbacks = {}) {
  const sessionRef = useRef<RealtimeSession | null>(null);
  const [status, setStatus] = useState<
    SessionStatus
  >('DISCONNECTED');
  const { logClientEvent } = useEvent();

  const updateStatus = useCallback(
    (s: SessionStatus) => {
      setStatus(s);
      callbacks.onConnectionChange?.(s);
      logClientEvent({}, s);
    },
    [callbacks],
  );

  const { logServerEvent } = useEvent();

  const historyHandlers = useHandleSessionHistory().current;

  function handleTransportEvent(event: any) {
    console.log("🚀 Transport event received:", event.type, event);
    
    // Simple intent: detect navigation commands in assistant speech and jump pages
    const lastNavRef = (handleTransportEvent as any)._lastNavRef || { ts: 0, page: 0 };
    (handleTransportEvent as any)._lastNavRef = lastNavRef;

    const numberWords: Record<string, number> = {
      one: 1, two: 2, three: 3, four: 4, five: 5,
      six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
      eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
      sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
      thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
    };

    const parsePageFromText = (text: string): number | null => {
      if (!text) return null;
      const lower = text.toLowerCase();
      const numMatch = lower.match(/(?:go\s*to|open|page)\s*(?:page\s*)?(\d{1,3})/i);
      if (numMatch) {
        const n = parseInt(numMatch[1], 10);
        return isNaN(n) ? null : n;
      }
      // Try number words (supports simple composites like "twenty one")
      const wordMatch = lower.match(/(?:go\s*to|open|page)\s*(?:page\s*)?([a-z\-\s]+)/i);
      if (wordMatch) {
        const tokens = wordMatch[1].trim().split(/\s+|\-/);
        let total = 0;
        for (const t of tokens) {
          const val = numberWords[t];
          if (val) {
            if (val >= 20 && total > 0) total += val; else total = total + val;
          }
        }
        return total > 0 ? total : null;
      }
      return null;
    };

    const maybeNavigateFrom = (text: string) => {
      const page = parsePageFromText(text);
      if (!page) return;
      const now = Date.now();
      if (now - lastNavRef.ts < 1500 && lastNavRef.page === page) return;
      lastNavRef.ts = now;
      lastNavRef.page = page;
      try {
        if (typeof window !== 'undefined') {
          // Prefer the working direct jump API
          if ((window as any).pdfJumpToPage) {
            (window as any).pdfJumpToPage(page);
          } else {
            const zeroBased = Math.max(0, page - 1);
            if (!(window as any).__pdfReady) {
              (window as any).__pendingPdfNav = zeroBased;
              const handler = () => {
                window.removeEventListener('pdf-ready', handler as EventListener);
                window.dispatchEvent(new CustomEvent('pdf-navigate-page', {
                  detail: { pageNumber: zeroBased }
                }));
              };
              window.addEventListener('pdf-ready', handler as EventListener, { once: true });
            } else {
              window.dispatchEvent(new CustomEvent('pdf-navigate-page', {
                detail: { pageNumber: zeroBased }
              }));
            }
          }
        }
      } catch {}
    };

    // Auto-advance pages while assistant is speaking, synced to audio start/stop
    const setupAutoAdvanceForSpeech = () => {
      try {
        const state: any = (window as any).__pdfSearchState;
        if (!state || !Array.isArray(state.results) || state.results.length === 0) return;
        const uniquePages: number[] = Array.from(new Set(state.results.map((r: any) => r.pageIndex)));
        if (uniquePages.length <= 1) return;

        // Milestones at ~1/3, ~2/3 of the way, and final at done
        const idx1 = Math.max(1, Math.min(uniquePages.length - 1, Math.round((uniquePages.length - 1) / 3)));
        const idx2 = Math.max(idx1, Math.min(uniquePages.length - 1, Math.round(((uniquePages.length - 1) * 2) / 3)));
        const page1 = uniquePages[idx1];
        const page2 = uniquePages[idx2];
        const finalPage = uniquePages[uniquePages.length - 1];

        const cfg = (window as any).__pdfSpeechMs ?? 9000; // Estimated total speech duration
        const t1 = Math.max(500, Math.floor(cfg / 3));
        const t2 = Math.max(t1 + 500, Math.floor((cfg * 2) / 3));

        const token = `speech-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        (window as any).__speechAdvanceToken = token;

        const jump = (oneBased: number) => {
          try {
            if ((window as any).pdfJumpToPage) (window as any).pdfJumpToPage(oneBased);
            else window.dispatchEvent(new CustomEvent('pdf-navigate-page', { detail: { pageNumber: Math.max(0, oneBased - 1) } }));
          } catch {}
        };

        // Schedule partial jumps
        (window as any).__speechAdvanceTimers?.forEach((id: number) => clearTimeout(id));
        (window as any).__speechAdvanceTimers = [];

        (window as any).__speechAdvanceTimers.push(setTimeout(() => {
          if ((window as any).__speechAdvanceToken !== token) return;
          jump(page1 + 1);
        }, t1) as unknown as number);

        (window as any).__speechAdvanceTimers.push(setTimeout(() => {
          if ((window as any).__speechAdvanceToken !== token) return;
          jump(page2 + 1);
        }, t2) as unknown as number);

        // Final jump will occur on response.audio.done
        (window as any).__speechAdvanceFinal = finalPage + 1;
      } catch {}
    };

    // Handle additional server events that aren't managed by the session
    switch (event.type) {
      case "conversation.item.input_audio_transcription.completed": {
        console.log("🎤 Transcription completed:", event);
        historyHandlers.handleTranscriptionCompleted(event);
        // Navigate on user command like "go to page 2"
        maybeNavigateFrom((event as any).transcript || (event as any).text || "");
        break;
      }
      case "response.audio_transcript.done": {
        console.log("🎵 Response transcript done:", event);
        historyHandlers.handleTranscriptionCompleted(event);
        maybeNavigateFrom((event as any).transcript || (event as any).text || "");
        
        // Dispatch tutor transcript event for PDF highlighting - only on complete utterances
        if (typeof window !== 'undefined' && (event as any).transcript) {
          window.dispatchEvent(new CustomEvent('tutor-transcript-delta', {
            detail: {
              itemId: (event as any).item_id || `response-complete-${Date.now()}`,
              delta: (event as any).transcript,
              transcript: (event as any).transcript,
              role: 'assistant',
              isComplete: true
            }
          }));
        }
        break;
      }
      case "response.audio_transcript.delta": {
        console.log("🎵 Response transcript delta:", event);
        historyHandlers.handleTranscriptionDelta(event);
        maybeNavigateFrom((event as any).delta || "");

        // Always emit a normalized event the UI can consume for live updates
        if (typeof window !== 'undefined' && (event as any).delta) {
          const delta = (event as any).delta as string;
          const transcript = ((event as any).transcript || '') as string;

          // General delta for incremental buffering/highlighting
          window.dispatchEvent(new CustomEvent('tutor-transcript-delta', {
            detail: {
              itemId: (event as any).item_id || `response-delta-${Date.now()}`,
              delta,
              transcript: transcript || delta,
              role: 'assistant',
              isUtterance: false,
              isComplete: false,
            }
          }));

          // If this delta ends an utterance, emit an utterance marker and trigger semantic search
          if (/[.!?]\s*$/.test(delta)) {
            window.dispatchEvent(new CustomEvent('tutor-transcript-delta', {
              detail: {
                itemId: (event as any).item_id || `response-utterance-${Date.now()}`,
                delta,
                transcript: transcript || delta,
                role: 'assistant',
                isUtterance: true,
                isComplete: false,
              }
            }));

            // Also trigger semantic search for meaningful utterances
            const cleanDelta = delta.trim();
            if (cleanDelta.length > 3 && !/^[.!?]+$/.test(cleanDelta)) {
              const sessionId = `session-${Date.now()}`;
              const utteranceId = `utterance-${Date.now()}-${Math.random().toString(36).slice(2)}`;
              triggerSemanticSearch(delta, sessionId, utteranceId);
            }
          }
        }
        break;
      }
      case "conversation.item.input_audio_transcription.delta": {
        console.log("🎤 Input transcription delta:", event);
        historyHandlers.handleTranscriptionDelta(event);
        // React quickly to user saying "go to page N"
        maybeNavigateFrom((event as any).delta || "");
        break;
      }
      case "response.audio": {
        console.log("🎵 Audio response received:", event);
        // On first audio, set up auto-advance plan based on latest search results
        setupAutoAdvanceForSpeech();
        break;
      }
      case "response.audio.done": {
        console.log("🎵 Audio response completed:", event);
        // Final jump to the last milestone page
        try {
          const finalPage: number | undefined = (window as any).__speechAdvanceFinal;
          if (finalPage) {
            if ((window as any).pdfJumpToPage) (window as any).pdfJumpToPage(finalPage);
            else window.dispatchEvent(new CustomEvent('pdf-navigate-page', { detail: { pageNumber: Math.max(0, finalPage - 1) } }));
          }
        } catch {}
        // Clear token and timers
        (window as any).__speechAdvanceToken = undefined;
        (window as any).__speechAdvanceTimers?.forEach((id: number) => clearTimeout(id));
        (window as any).__speechAdvanceTimers = [];
        break;
      }
      default: {
        logServerEvent(event);
        break;
      } 
    }
  }

  const codecParamRef = useRef<string>(
    (typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('codec') ?? 'opus')
      : 'opus')
      .toLowerCase(),
  );

  // Wrapper to pass current codec param
  const applyCodec = useCallback(
    (pc: RTCPeerConnection) => applyCodecPreferences(pc, codecParamRef.current),
    [],
  );

  const handleAgentHandoff = (item: any) => {
    const history = item.context.history;
    const lastMessage = history[history.length - 1];
    const agentName = lastMessage.name.split("transfer_to_")[1];
    callbacks.onAgentHandoff?.(agentName);
  };

  // Setup event listeners directly in connect function
  const setupEventListeners = (session: RealtimeSession) => {
    // Error handler - completely safe version
    const errorHandler = (...args: any[]) => {
      // Don't do anything that could throw - just silently handle errors
      setTimeout(() => {
        try {
          console.warn("Session error occurred (suppressed)");
        } catch {
          // Even this could fail, so ignore it
        }
      }, 0);
    };

    // Log server errors
    session.on("error", errorHandler);

    // history events
    session.on("agent_handoff", handleAgentHandoff);
    session.on("agent_tool_start", (details, agent, functionCall) => {
      console.log("🔧 TOOL START:", functionCall.name, functionCall);
      historyHandlers.handleAgentToolStart(details, agent, functionCall);
    });
    session.on("agent_tool_end", (details, agent, functionCall, result) => {
      console.log("🔧 TOOL END:", functionCall.name, result);
      historyHandlers.handleAgentToolEnd(details, agent, functionCall, result);
      
      // Handle semantic search tool results
      if (functionCall.name === 'semantic_search') {
        try {
          const toolResult = typeof result === 'string' ? JSON.parse(result) : result;
          if (toolResult?.shouldHighlight && toolResult?.results) {
            console.log("🔍 Processing semantic search results for highlighting:", toolResult.results.length);
            
            // Dispatch semantic fragment events for each result
            toolResult.results.forEach((semanticResult: any, index: number) => {
              if (semanticResult.text && semanticResult.text.length > 10 && semanticResult.similarity > 0.6) {
                console.log(`🔍 Dispatching highlight event for semantic result ${index}:`, {
                  text: semanticResult.text.substring(0, 50),
                  similarity: semanticResult.similarity,
                  page: semanticResult.page
                });
                
                setTimeout(() => {
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('tutor-highlight-semantic-fragment', {
                      detail: {
                        text: semanticResult.text,
                        page: semanticResult.page,
                        similarity: semanticResult.similarity,
                        query: toolResult.query,
                        chunkId: semanticResult.chunkId,
                        startIndex: semanticResult.startIndex,
                        endIndex: semanticResult.endIndex,
                        highlightIndex: index,
                        source: 'agent-tool'
                      }
                    }));
                  }
                }, index * 100); // Quick highlighting
              }
            });
          }
        } catch (error) {
          console.error("🔍 Error processing semantic search tool result:", error);
        }
      }
    });
    session.on("history_updated", historyHandlers.handleHistoryUpdated);
    session.on("history_added", historyHandlers.handleHistoryAdded);
    session.on("guardrail_tripped", historyHandlers.handleGuardrailTripped);

    // additional transport events
    session.on("transport_event", handleTransportEvent);

    console.log("✅ Event listeners attached to session");
  };

  const connect = useCallback(
    async ({
      getEphemeralKey,
      initialAgents,
      audioElement,
      extraContext,
      outputGuardrails,
    }: ConnectOptions) => {
      if (sessionRef.current) return; // already connected

      updateStatus('CONNECTING');

      const ek = await getEphemeralKey();
      const rootAgent = initialAgents[0];

      // This lets you use the codec selector in the UI to force narrow-band (8 kHz) codecs to
      //  simulate how the voice agent sounds over a PSTN/SIP phone call.
      const codecParam = codecParamRef.current;
      const audioFormat = audioFormatForCodec(codecParam);

      sessionRef.current = new RealtimeSession(rootAgent, {
        transport: new OpenAIRealtimeWebRTC({
          audioElement,
          // Set preferred codec before offer creation
          changePeerConnection: async (pc: RTCPeerConnection) => {
            applyCodec(pc);
            return pc;
          },
        }),
        model: 'gpt-4o-realtime-preview-2025-06-03',
        config: {
          inputAudioFormat: audioFormat,
          outputAudioFormat: audioFormat,
          inputAudioTranscription: {
            model: 'gpt-4o-transcribe',
            language: 'en',
          },
        },
        outputGuardrails: outputGuardrails ?? [],
        context: extraContext ?? {},
      });

      console.log("🔗 Connecting session with ephemeral key...");
      await sessionRef.current.connect({ apiKey: ek });
      console.log("✅ Session connected successfully");
      
      // Clear all highlights and reset to page 1 when starting new session
      if (typeof window !== 'undefined') {
        // Clear all highlights
        window.dispatchEvent(new CustomEvent('clear-all-highlights'));
        console.log("🧹 Cleared all highlights for new session");
        
        // Reset to page 1
        window.dispatchEvent(new CustomEvent('navigate-to-page', { detail: { page: 1 } }));
        console.log("📄 Reset to page 1 for new session");
      }
      
      // Setup event listeners after connection
      setupEventListeners(sessionRef.current);
      
      // Initialize document ID for semantic search
      const documentId = (window as any).__currentDocumentId || 
                        window.location.pathname.split('/').pop();
      if (documentId) {
        console.log("🔍 Document ID set for semantic search:", documentId);
      }
      
      updateStatus('CONNECTED');
    },
    [callbacks, updateStatus, logServerEvent],
  );

  const disconnect = useCallback(async () => {
    if (sessionRef.current) {
      try {
        await sessionRef.current.close();
      } catch (error) {
        console.error('Error closing session:', error);
      } finally {
        sessionRef.current = null;
        updateStatus('DISCONNECTED');
      }
    } else {
      updateStatus('DISCONNECTED');
    }
  }, [updateStatus]);

  const assertconnected = () => {
    if (!sessionRef.current) throw new Error('RealtimeSession not connected');
  };
  

  /* ----------------------- message helpers ------------------------- */

  const interrupt = useCallback(() => {
    sessionRef.current?.interrupt();
  }, []);
  
  const sendUserText = useCallback((text: string) => {
    assertconnected();
    sessionRef.current!.sendMessage(text);
  }, []);

  const sendEvent = useCallback((ev: any) => {
    sessionRef.current?.transport.sendEvent(ev);
  }, []);

  const mute = useCallback((m: boolean) => {
    sessionRef.current?.mute(m);
  }, []);

  const pushToTalkStart = useCallback(() => {
    if (!sessionRef.current) return;
    sessionRef.current.transport.sendEvent({ type: 'input_audio_buffer.clear' } as any);
  }, []);

  const pushToTalkStop = useCallback(() => {
    if (!sessionRef.current) return;
    sessionRef.current.transport.sendEvent({ type: 'input_audio_buffer.commit' } as any);
    sessionRef.current.transport.sendEvent({ type: 'response.create' } as any);
  }, []);
  

  return {
    status,
    connect,
    disconnect,
    sendUserText,
    sendEvent,
    mute,
    pushToTalkStart,
    pushToTalkStop,
    interrupt,
  } as const;
}
