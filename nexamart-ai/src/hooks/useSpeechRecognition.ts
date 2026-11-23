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
  autoSubmitDelay = 5000,
}: UseSpeechRecognitionOptions = {}) {
  const [speechRecognitionFactory] = useState<SpeechRecognitionConstructor | null>(() => {
    if (typeof window === 'undefined') return null;
    const speechWindow = window as unknown as SpeechRecognitionWindow;
    return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition || null;
  });

  const isSupported = Boolean(speechRecognitionFactory);
  const [isListening, setIsListening] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [status, setStatus] = useState<VoiceRecognitionStatus>(() =>
    isSupported ? 'idle' : 'unsupported'
  );
  const [announcement, setAnnouncement] = useState('');

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceSessionIdRef = useRef(0);
  const activeSessionIdRef = useRef<number | null>(null);
  const finalTranscriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const submittedForSessionRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const getTranscript = useCallback(() => {
    return [finalTranscriptRef.current, interimTranscriptRef.current]
      .filter(Boolean)
      .join(' ')
      .replace(/\\s+/g, ' ')
      .trim();
  }, []);

  const stopListening = useCallback((submitFinal = false, discard = false) => {
    const sessionId = activeSessionIdRef.current;
    if (sessionId === null) return;

    activeSessionIdRef.current = null;
    clearSilenceTimer();
    setIsListening(false);
    setIsSessionActive(false);

    try {
      recognitionRef.current?.stop();
    } catch {
      try {
        recognitionRef.current?.abort();
      } catch {
        // Browser recognition may already have stopped.
      }
    }

    const transcript = getTranscript();

    if (discard) {
      finalTranscriptRef.current = '';
      interimTranscriptRef.current = '';
      submittedForSessionRef.current = sessionId;
      onInterimTranscript?.('');
      setStatus('stopped');
      setAnnouncement('Voice recording canceled. The transcript was discarded.');
      return;
    }

    if (submitFinal && transcript && submittedForSessionRef.current !== sessionId) {
      submittedForSessionRef.current = sessionId;
      setStatus('success');
      setAnnouncement('Voice message confirmed. Sending your message to Nexa.');
      onFinalTranscript?.(transcript);
      finalTranscriptRef.current = '';
      interimTranscriptRef.current = '';
      return;
    }

    setStatus('stopped');
    setAnnouncement(
      transcript
        ? 'Microphone stopped. Your transcript is ready to edit before sending.'
        : 'Microphone stopped.'
    );
  }, [clearSilenceTimer, getTranscript, onFinalTranscript, onInterimTranscript]);

  const resetSilenceTimer = useCallback((sessionId: number) => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      if (activeSessionIdRef.current !== sessionId) return;

      if (getTranscript()) {
        stopListening(true);
      } else {
        stopListening(false);
        setStatus('no-speech');
        setAnnouncement('No speech was detected. Please try again or type your request.');
      }
    }, Math.max(1000, autoSubmitDelay));
  }, [autoSubmitDelay, clearSilenceTimer, getTranscript, stopListening]);

  useEffect(() => {
    return () => {
      activeSessionIdRef.current = null;
      clearSilenceTimer();
      try {
        recognitionRef.current?.abort();
      } catch {
        // Safe ignore during unmount.
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
      stopListening(false);
      return;
    }

    const sessionId = ++voiceSessionIdRef.current;
    activeSessionIdRef.current = sessionId;
    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    submittedForSessionRef.current = null;

    let recognition: SpeechRecognitionLike;
    try {
      recognition = new speechRecognitionFactory();
      recognitionRef.current = recognition;
    } catch {
      activeSessionIdRef.current = null;
      setIsListening(false);
      setIsSessionActive(false);
      setStatus('failed');
      setAnnouncement('Unable to start microphone access. Please try again or type your request.');
      return;
    }

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      if (activeSessionIdRef.current !== sessionId) return;

      const finalParts: string[] = [];
      const interimParts: string[] = [];

      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim();
        if (!transcript) continue;
        if (result.isFinal) finalParts.push(transcript);
        else interimParts.push(transcript);
      }

      finalTranscriptRef.current = finalParts.join(' ').replace(/\\s+/g, ' ').trim();
      interimTranscriptRef.current = interimParts.join(' ').replace(/\\s+/g, ' ').trim();

      const transcript = getTranscript();
      if (transcript) {
        onInterimTranscript?.(transcript);
        setStatus('listening');
        resetSilenceTimer(sessionId);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (activeSessionIdRef.current !== sessionId) return;

      const transcript = getTranscript();
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        activeSessionIdRef.current = null;
        clearSilenceTimer();
        setIsListening(false);
        setIsSessionActive(false);
        setStatus('permission-denied');
        setAnnouncement('Microphone access denied. Enable microphone permissions or type your request.');
        return;
      }

      if (event.error === 'no-speech' && !transcript) {
        activeSessionIdRef.current = null;
        clearSilenceTimer();
        setIsListening(false);
        setIsSessionActive(false);
        setStatus('no-speech');
        setAnnouncement('No speech was detected. Please try again or type your request.');
        return;
      }

      setIsListening(false);
      setStatus(transcript ? 'interrupted' : 'failed');
      setAnnouncement(
        transcript
          ? 'Speech recognition was interrupted. Your transcript is preserved; press Done to send or Stop & Edit to revise it.'
          : 'Voice recognition failed. Please try again or type your request.'
      );
      if (!transcript) {
        activeSessionIdRef.current = null;
        clearSilenceTimer();
        setIsSessionActive(false);
      }
    };

    recognition.onend = () => {
      if (activeSessionIdRef.current !== sessionId) return;

      // Browsers may end recognition after one phrase even while the user is still
      // thinking. Keep the session and its silence timer alive; never submit here.
      setIsListening(false);
      const transcript = getTranscript();
      setStatus(transcript ? 'interrupted' : 'no-speech');
      setAnnouncement(
        transcript
          ? 'Speech capture paused. Your words are preserved. You can continue waiting, press Done, or Stop & Edit.'
          : 'Microphone paused while waiting for speech. You can try again or cancel.'
      );
    };

    try {
      recognition.start();
      setIsListening(true);
      setIsSessionActive(true);
      setStatus('listening');
      setAnnouncement('Microphone active. Speak your shopping request. It will send after five seconds of silence.');
      resetSilenceTimer(sessionId);
    } catch {
      activeSessionIdRef.current = null;
      clearSilenceTimer();
      setIsListening(false);
      setIsSessionActive(false);
      setStatus('failed');
      setAnnouncement('Could not start microphone. Check browser permissions or type your request.');
    }
  }, [
    clearSilenceTimer,
    getTranscript,
    isSupported,
    onInterimTranscript,
    resetSilenceTimer,
    speechRecognitionFactory,
    stopListening,
  ]);

  return {
    isSupported,
    isListening,
    isSessionActive,
    status,
    announcement,
    startListening,
    stopListening,
  };
}
