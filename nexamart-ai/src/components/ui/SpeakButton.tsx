import { useState, useCallback, useRef } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from './button';

interface SpeakButtonProps {
  text: string;
  className?: string;
  label?: string;
}

export function SpeakButton({ text, className, label = 'Read aloud' }: SpeakButtonProps) {
  const [speaking, setSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const handleSpeak = useCallback(() => {
    if (!text) return;

    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }, [text, speaking]);

  if (!text) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleSpeak}
      aria-label={speaking ? 'Stop reading' : label}
      className={className}
    >
      {speaking ? (
        <VolumeX className="w-4 h-4 mr-1" />
      ) : (
        <Volume2 className="w-4 h-4 mr-1" />
      )}
      {speaking ? 'Stop' : 'Listen'}
    </Button>
  );
}
