import { useState, useRef, useEffect, useCallback } from 'react';

export function cleanTextForSpeech(rawText: string, recommendationCount = 0): string {
  if (!rawText) return '';

  let cleaned = rawText
    // Remove markdown links: [link text](url) -> link text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove URLs
    .replace(/https?:\/\/\S+/g, '')
    // Remove bold/italics
    .replace(/[*_~`]/g, '')
    // Remove markdown headers
    .replace(/^#+\s+/gm, '')
    // Remove list bullets: - item or * item
    .replace(/^[-*]\s+/gm, '')
    // Replace multiple newlines or spaces with single space
    .replace(/\s+/g, ' ')
    .trim();

  if (recommendationCount > 0) {
    cleaned += ` ${recommendationCount} recommended product${recommendationCount > 1 ? 's are' : ' is'} displayed on screen.`;
  }

  return cleaned;
}

export function useSpeechSynthesis() {
  const [isSupported] = useState(() => {
    if (typeof window === 'undefined') return false;
    return 'speechSynthesis' in window;
  });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [speechAnnouncement, setSpeechAnnouncement] = useState<string>('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (!isSupported) return;

    const updateVoices = () => {
      try {
        const availableVoices = window.speechSynthesis.getVoices();
        if (Array.isArray(availableVoices) && availableVoices.length > 0) {
          setVoices(availableVoices);
        }
      } catch {
        // Safe ignore
      }
    };

    updateVoices();
    if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }

    return () => {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Safe ignore
      }
    };
  }, [isSupported]);

  const stopSpeaking = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel();
    } catch {
      // Safe ignore
    }

    setIsSpeaking(false);
    setSpeakingMessageId(null);
    currentUtteranceRef.current = null;
    setSpeechAnnouncement('Nexa stopped speaking.');
  }, []);

  const speak = useCallback(
    (rawText: string, messageId: string, recommendationCount = 0) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        setSpeechAnnouncement('Text-to-speech is not supported in this browser.');
        return;
      }

      // If already speaking this message, toggle it off
      if (isSpeaking && speakingMessageId === messageId) {
        stopSpeaking();
        return;
      }

      // Stop any existing speech before starting new speech
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Safe ignore
      }

      const spokenText = cleanTextForSpeech(rawText, recommendationCount);
      if (!spokenText) return;

      const utterance = new SpeechSynthesisUtterance(spokenText);
      currentUtteranceRef.current = utterance;

      // Select natural English voice if available
      const preferredVoice =
        voices.find(
          (v) =>
            v.lang.startsWith('en') &&
            (v.name.includes('Natural') ||
              v.name.includes('Google') ||
              v.name.includes('Samantha') ||
              v.name.includes('Karen') ||
              v.name.includes('Daniel') ||
              v.name.includes('Moira'))
        ) ||
        voices.find((v) => v.lang.startsWith('en')) ||
        null;

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      utterance.onstart = () => {
        setIsSpeaking(true);
        setSpeakingMessageId(messageId);
        setSpeechAnnouncement("Nexa is speaking response aloud. Activate the Stop button to silence.");
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        setSpeakingMessageId(null);
        currentUtteranceRef.current = null;
        setSpeechAnnouncement('Nexa finished speaking.');
      };

      utterance.onerror = (event) => {
        // 'interrupted' and 'canceled' are expected when stopped by user
        if (event.error !== 'interrupted' && event.error !== 'canceled') {
          setSpeechAnnouncement('Speech playback encountered an error.');
        }
        setIsSpeaking(false);
        setSpeakingMessageId(null);
        currentUtteranceRef.current = null;
      };

      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        setIsSpeaking(false);
        setSpeakingMessageId(null);
        setSpeechAnnouncement('Could not play speech response.');
      }
    },
    [isSpeaking, speakingMessageId, stopSpeaking, voices]
  );

  return {
    isSupported,
    isSpeaking,
    speakingMessageId,
    speechAnnouncement,
    speak,
    stopSpeaking,
  };
}
