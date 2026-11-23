import { useState, useRef, useEffect, useCallback } from 'react';

export type VoiceRecognitionStatus =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'success'
  | 'no-speech'
  | 'permission-denied'
  | 'unsupported'
  | 'interrupted'
  | 'failed'
  | 'stopped';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike extends ArrayLike<SpeechRecognitionAlternativeLike> {
  isFinal: boolean;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

interface UseSpeechRecognitionOptions {
  onInterimTranscript?: (transcript: string) => void;
  onFinalTranscript?: (transcript: string) => void;
  autoSubmitDelay?: number;
}

export function useSpeechRecognition({
  onInterimTranscript,
  onFinalTranscript,
}: UseSpeechRecognitionOptions = {}) {
  const [speechRecognitionFactory] = useState<SpeechRecognitionConstructor | null>(() => {
    if (typeof window === 'undefined') return null;
    const speechWindow = window as unknown as SpeechRecognitionWindow;
    return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition || null;
  });

  const isSupported = Boolean(speechRecognitionFactory);

  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState<VoiceRecognitionStatus>(() =>
    isSupported ? 'idle' : 'unsupported'
  );
  const [announcement, setAnnouncement] = useState<string>('');

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceSessionIdRef = useRef(0);
  const activeSessionIdRef = useRef<number | null>(null);
  const finalTranscriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const hasSpokenRef = useRef(false);
  const submittedForSessionRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const stopListening = useCallback((submitFinal = false) => {
    clearSilenceTimer();
    const currentSessionId = activeSessionIdRef.current;
    activeSessionIdRef.current = null;
    setIsListening(false);

    try {
      recognitionRef.current?.stop();
    } catch {
      try {
        recognitionRef.current?.abort();
      } catch {
        // Safe ignore
      }
    }

    const transcript = finalTranscriptRef.current.trim() || interimTranscriptRef.current.trim();

    if (submitFinal && transcript && currentSessionId && submittedForSessionRef.current !== currentSessionId) {
      submittedForSessionRef.current = currentSessionId;
      setStatus('success');
      setAnnouncement(`Speech recognized: "${transcript}". Submitting your message to Nexa.`);
      if (onFinalTranscript) {
        onFinalTranscript(transcript);
      }
    } else if (transcript) {
      setStatus('stopped');
      setAnnouncement(`Microphone stopped. Transcript ready in the message box. You can edit before sending.`);
    } else {
      setStatus('stopped');
      setAnnouncement('Microphone stopped.');
    }
  }, [clearSilenceTimer, onFinalTranscript]);

  const resetSilenceTimer = useCallback((sessionId: number) => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      if (activeSessionIdRef.current === sessionId) {
        stopListening(false);
        setStatus('interrupted');
        setAnnouncement('Microphone stopped due to silence.');
      }
    }, 7000);
  }, [clearSilenceTimer, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeSessionIdRef.current = null;
      clearSilenceTimer();
      try {
        recognitionRef.current?.abort();
      } catch {
        // Safe ignore
      }
    };
  }, [clearSilenceTimer]);

  const startListening = useCallback(() => {
    if (!isSupported || !speechRecognitionFactory) {
      setStatus('unsupported');
      setAnnouncement('Voice input is not supported in this browser. Please use the text input.');
      return;
    }

    if (activeSessionIdRef.current !== null) {
      // Toggle off if currently active
      stopListening(false);
      return;
    }

    const sessionId = ++voiceSessionIdRef.current;
    activeSessionIdRef.current = sessionId;
    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    hasSpokenRef.current = false;

    try {
      recognitionRef.current = new speechRecognitionFactory();
    } catch {
      activeSessionIdRef.current = null;
      setStatus('failed');
      setAnnouncement('Unable to access microphone. Please try again or type your message.');
      return;
    }

    const recognition = recognitionRef.current;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      if (activeSessionIdRef.current !== sessionId) return;
      resetSilenceTimer(sessionId);

      const finalParts: string[] = [];
      const interimParts: string[] = [];

      for (let i = 0; i < event.results.length; i++) {
        const item = event.results[i];
        const text = item?.[0]?.transcript?.trim();
        if (!text) continue;
        if (item.isFinal) {
          finalParts.push(text);
        } else {
          interimParts.push(text);
        }
      }

      const finalJoined = finalParts.join(' ').replace(/\s+/g, ' ').trim();
      const interimJoined = interimParts.join(' ').replace(/\s+/g, ' ').trim();

      finalTranscriptRef.current = finalJoined;
      interimTranscriptRef.current = interimJoined;
      hasSpokenRef.current = Boolean(finalJoined || interimJoined);

      const currentText = [finalJoined, interimJoined].filter(Boolean).join(' ');
      if (onInterimTranscript && currentText) {
        onInterimTranscript(currentText);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (activeSessionIdRef.current !== sessionId) return;
      clearSilenceTimer();
      activeSessionIdRef.current = null;
      setIsListening(false);

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setStatus('permission-denied');
        setAnnouncement('Microphone access denied. Please enable microphone permissions in your browser or type your request.');
      } else if (event.error === 'no-speech') {
        setStatus('no-speech');
        setAnnouncement('No speech was detected. Please try speaking again or type your request.');
      } else if (event.error === 'aborted') {
        setStatus('interrupted');
        setAnnouncement('Voice input canceled.');
      } else {
        setStatus('failed');
        setAnnouncement('Voice recognition failed. Please try again or use typed input.');
      }
    };

    recognition.onend = () => {
      if (activeSessionIdRef.current !== sessionId) return;
      clearSilenceTimer();
      activeSessionIdRef.current = null;
      setIsListening(false);

      const transcript = finalTranscriptRef.current.trim() || interimTranscriptRef.current.trim();

      if (!transcript) {
        if (hasSpokenRef.current) {
          setStatus('interrupted');
          setAnnouncement('Speech recognition ended before message was captured.');
        } else {
          setStatus('no-speech');
          setAnnouncement('No speech detected. Microphone stopped.');
        }
        return;
      }

      // Ensure one spoken message produces strictly one AI request
      if (submittedForSessionRef.current === sessionId) return;
      submittedForSessionRef.current = sessionId;

      setStatus('success');
      setAnnouncement(`Voice message received: "${transcript}". Submitting your message to Nexa.`);

      if (onFinalTranscript) {
        onFinalTranscript(transcript);
      }
    };

    try {
      recognition.start();
      setIsListening(true);
      setStatus('listening');
      setAnnouncement('Microphone active. Listening for your shopping request. Speak clearly now.');
      resetSilenceTimer(sessionId);
    } catch {
      activeSessionIdRef.current = null;
      setIsListening(false);
      setStatus('failed');
      setAnnouncement('Could not start microphone. Please check permissions or type your request.');
    }
  }, [
    isSupported,
    speechRecognitionFactory,
    onInterimTranscript,
    onFinalTranscript,
    stopListening,
    resetSilenceTimer,
    clearSilenceTimer,
  ]);

  return {
    isSupported,
    isListening,
    status,
    announcement,
    startListening,
    stopListening,
  };
}
