import { useCallback, useRef, useState, useEffect } from 'react';
import {
  RealtimeSession,
  RealtimeAgent,
  OpenAIRealtimeWebSocket,
} from '@openai/agents/realtime';

import { audioFormatForCodec, applyCodecPreferences } from '@/lib/codecUtils';
import { SessionStatus } from '@/types';

export interface RealtimeSessionCallbacks {
  onConnectionChange?: (status: SessionStatus) => void;
  onAgentHandoff?: (agentName: string) => void;
}

export interface ConnectOptions {
  getEphemeralKey: () => Promise<string>;
  initialAgent: RealtimeAgent;
  audioElement?: HTMLAudioElement;
  pdfContext?: string;
  currentPage?: number;
}

export function useRealtimeSession(callbacks: RealtimeSessionCallbacks = {}) {
  const sessionRef = useRef<RealtimeSession | null>(null);
  const [status, setStatus] = useState<SessionStatus>('DISCONNECTED');

  const updateStatus = useCallback(
    (s: SessionStatus) => {
      setStatus(s);
      callbacks.onConnectionChange?.(s);
    },
    [callbacks],
  );

  function handleTransportEvent(event: any) {
    console.log("🚀 Transport event received:", event.type, event);
    
    switch (event.type) {
      case "conversation.item.input_audio_transcription.completed": {
        console.log("🎤 Transcription completed:", event);
        break;
      }
      case "response.audio_transcript.done": {
        console.log("🎵 Response transcript done:", event);
        break;
      }
      case "response.audio_transcript.delta": {
        console.log("🎵 Response transcript delta:", event);
        break;
      }
      default: {
        console.log('Transport event:', event);
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

  const applyCodec = useCallback(
    (pc: RTCPeerConnection) => applyCodecPreferences(pc, codecParamRef.current),
    [],
  );

  // Setup event listeners
  const setupEventListeners = (session: RealtimeSession) => {
    const errorHandler = (...args: any[]) => {
      try {
        console.error("❌ Session error:", args[0]);
        updateStatus('DISCONNECTED');
      } catch (logError) {
        console.error("❌ Error in error handler:", logError);
      }
    };

    session.on("error", errorHandler);
    session.on("transport_event", handleTransportEvent);

    console.log("✅ Event listeners attached to session");
  };

  const connect = useCallback(
    async ({
      getEphemeralKey,
      initialAgent,
      audioElement,
      pdfContext,
      currentPage,
    }: ConnectOptions) => {
      if (sessionRef.current) return;

      updateStatus('CONNECTING');

      try {
        const ek = await getEphemeralKey();
        const codecParam = codecParamRef.current;
        const audioFormat = audioFormatForCodec(codecParam);

        sessionRef.current = new RealtimeSession(initialAgent, {
          transport: new OpenAIRealtimeWebSocket({
            audioElement: audioElement,
            apiKey: ek,
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
          context: {
            pdfContext: pdfContext || '',
            currentPage: currentPage || 1,
          },
        });

        console.log("🔗 Connecting session...");
        await sessionRef.current.connect();
        console.log("✅ Session connected successfully");
        
        setupEventListeners(sessionRef.current);
        updateStatus('CONNECTED');
      } catch (error) {
        console.error('Failed to connect to realtime session:', error);
        updateStatus('DISCONNECTED');
      }
    },
    [callbacks, updateStatus],
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

  const assertConnected = () => {
    if (!sessionRef.current) throw new Error('RealtimeSession not connected');
  };

  const interrupt = useCallback(() => {
    sessionRef.current?.interrupt();
  }, []);
  
  const sendUserText = useCallback((text: string) => {
    assertConnected();
    sessionRef.current!.sendMessage(text);
  }, []);

  const sendEvent = useCallback((ev: any) => {
    if (sessionRef.current && status === 'CONNECTED') {
      try {
        sessionRef.current.transport.sendEvent(ev);
      } catch (error) {
        console.warn('Failed to send event, session may not be ready:', error);
      }
    }
  }, [status]);

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