import { useCallback, useRef, useState, useEffect } from 'react';
import {
  RealtimeSession,
  RealtimeAgent,
  OpenAIRealtimeWebRTC,
} from '@openai/agents/realtime';

import { audioFormatForCodec, applyCodecPreferences } from '../lib/codecUtils';
import { SessionStatus, TutorMessage, PDFAnnotation } from '../types';

export interface RealtimeSessionCallbacks {
  onConnectionChange?: (status: SessionStatus) => void;
  onMessageReceived?: (message: TutorMessage) => void;
  onAnnotationCreated?: (annotation: PDFAnnotation) => void;
  onPageNavigation?: (page: number) => void;
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

  function handleTransportEvent(event: any) {
    // Handle tutor-specific events
    switch (event.type) {
      case "conversation.item.input_audio_transcription.completed": {
        // Handle user speech transcription
        const transcription = event.transcript;
        if (transcription && callbacks.onMessageReceived) {
          callbacks.onMessageReceived({
            id: Date.now().toString(),
            role: 'user',
            content: transcription,
            timestamp: new Date()
          });
        }
        break;
      }
      case "response.audio_transcript.done": {
        // Handle assistant response transcription
        const transcription = event.transcript;
        if (transcription && callbacks.onMessageReceived) {
          callbacks.onMessageReceived({
            id: Date.now().toString(),
            role: 'assistant',
            content: transcription,
            timestamp: new Date()
          });
        }
        break;
      }
      case "response.audio_transcript.delta": {
        // Handle streaming assistant response
        // Could be used for real-time transcript updates
        break;
      }
      default: {
        console.log('Transport event:', event);
        break;
      } 
    }
  }

  useEffect(() => {
    if (sessionRef.current) {
      // Log server errors
      sessionRef.current.on("error", (...args: any[]) => {
        console.error("Realtime session error:", args[0]);
      });

      // additional transport events
      sessionRef.current.on("transport_event", handleTransportEvent);
    }
  }, [sessionRef.current]);

  const connect = useCallback(
    async ({
      getEphemeralKey,
      initialAgent,
      audioElement,
      pdfContext,
      currentPage,
    }: ConnectOptions) => {
      if (sessionRef.current) return; // already connected

      updateStatus('CONNECTING');

      try {
        const ek = await getEphemeralKey();

        // This lets you use the codec selector in the UI to force narrow-band (8 kHz) codecs to
        //  simulate how the voice agent sounds over a PSTN/SIP phone call.
        const codecParam = codecParamRef.current;
        const audioFormat = audioFormatForCodec(codecParam);

        sessionRef.current = new RealtimeSession(initialAgent, {
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
              model: 'gpt-4o-mini-transcribe',
            },
          },
          context: {
            pdfContext: pdfContext || '',
            currentPage: currentPage || 1,
          },
        });

        await sessionRef.current.connect({ apiKey: ek });
        updateStatus('CONNECTED');
      } catch (error) {
        console.error('Failed to connect to realtime session:', error);
        updateStatus('DISCONNECTED');
      }
    },
    [callbacks, updateStatus],
  );

  const disconnect = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    updateStatus('DISCONNECTED');
  }, [updateStatus]);

  const assertConnected = () => {
    if (!sessionRef.current) throw new Error('RealtimeSession not connected');
  };

  /* ----------------------- message helpers ------------------------- */

  const interrupt = useCallback(() => {
    sessionRef.current?.interrupt();
  }, []);
  
  const sendUserText = useCallback((text: string) => {
    assertConnected();
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

  const updatePDFContext = useCallback((pdfText: string, currentPage: number) => {
    if (!sessionRef.current) return;
    // Update the context with new PDF information
    sessionRef.current.transport.sendEvent({
      type: 'session.update',
      session: {
        context: {
          pdfContext: pdfText,
          currentPage: currentPage,
        }
      }
    } as any);
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
    updatePDFContext,
  } as const;
}
