import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Sparkles, Loader2, Mic, MicOff } from 'lucide-react';
import { invokeAIAssistant, isGuestAILimitError } from '../lib/aiAssistantClient';
import { toast } from 'sonner';

const REGULAR_EXAMPLES = ['Black shoes', 'Laptops', "Men's jackets"];
const AI_EXAMPLES = ['Black shoes under KES 5,000', 'Wireless headphones', "Men's jackets"];

type VoiceStatus =
  | 'idle'
  | 'listening'
  | 'submitting'
  | 'submitted'
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
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

// Deterministic price patterns for ordinary voice search
const PRICE_PATTERNS = [
  { regex: /\bbetween\s+([\d,]+(?:\.\d{1,2})?)\s+(?:Kenyan\s+)?shillings?\s+and\s+([\d,]+(?:\.\d{1,2})?)\s+(?:Kenyan\s+)?shillings?\b/i, type: 'range' as const },
  { regex: /\bunder\s+([\d,]+(?:\.\d{1,2})?)\s+(?:Kenyan\s+)?shillings?\b/i, type: 'max' as const },
  { regex: /\bbelow\s+([\d,]+(?:\.\d{1,2})?)\s+(?:Kenyan\s+)?shillings?\b/i, type: 'max' as const },
  { regex: /\bless than\s+([\d,]+(?:\.\d{1,2})?)\s+(?:Kenyan\s+)?shillings?\b/i, type: 'max' as const },
  { regex: /\babove\s+([\d,]+(?:\.\d{1,2})?)\s+(?:Kenyan\s+)?shillings?\b/i, type: 'min' as const },
  { regex: /\bover\s+([\d,]+(?:\.\d{1,2})?)\s+(?:Kenyan\s+)?shillings?\b/i, type: 'min' as const },
  { regex: /\bmore than\s+([\d,]+(?:\.\d{1,2})?)\s+(?:Kenyan\s+)?shillings?\b/i, type: 'min' as const },
  { regex: /\bbetween\s+(?:KES|KSh)\s*([\d,]+(?:\.\d{1,2})?)\s+and\s+(?:KES|KSh)\s*([\d,]+(?:\.\d{1,2})?)/i, type: 'range' as const },
  { regex: /\bunder\s+(?:KES|KSh)\s*([\d,]+(?:\.\d{1,2})?)/i, type: 'max' as const },
  { regex: /\bbelow\s+(?:KES|KSh)\s*([\d,]+(?:\.\d{1,2})?)/i, type: 'max' as const },
  { regex: /\bless than\s+(?:KES|KSh)\s*([\d,]+(?:\.\d{1,2})?)/i, type: 'max' as const },
  { regex: /\babove\s+(?:KES|KSh)\s*([\d,]+(?:\.\d{1,2})?)/i, type: 'min' as const },
  { regex: /\bover\s+(?:KES|KSh)\s*([\d,]+(?:\.\d{1,2})?)/i, type: 'min' as const },
  { regex: /\bmore than\s+(?:KES|KSh)\s*([\d,]+(?:\.\d{1,2})?)/i, type: 'min' as const },
];

function parseVoiceQuery(query: string): { keywords: string; minPrice?: number; maxPrice?: number; fallbackQuery?: string; hasPriceConstraint: boolean } {
  let minPrice: number | undefined;
  let maxPrice: number | undefined;
  let keywords = query;
  let hasPriceConstraint = false;

  for (const pattern of PRICE_PATTERNS) {
    const match = pattern.regex.exec(query);
    if (match) {
      hasPriceConstraint = true;
      if (pattern.type === 'max' && match[1]) {
        maxPrice = Number(match[1].replace(/,/g, ''));
        keywords = keywords.replace(match[0], ' ');
      } else if (pattern.type === 'min' && match[1]) {
        minPrice = Number(match[1].replace(/,/g, ''));
        keywords = keywords.replace(match[0], ' ');
      } else if (pattern.type === 'range' && match[1] && match[2]) {
        const p1 = Number(match[1].replace(/,/g, ''));
        const p2 = Number(match[2].replace(/,/g, ''));
        minPrice = Math.min(p1, p2);
        maxPrice = Math.max(p1, p2);
        keywords = keywords.replace(match[0], ' ');
      }
      break;
    }
  }

  keywords = keywords
    .replace(/^\s*(?:(?:can you find(?: me)?|i am looking for|find me|show me|i need|i want|get me|search for|look for)\b[\s,:-]*)+/i, '')
    .replace(/^\s*(?:a|an|the)\s+/i, '')
    .replace(/\s+(?:products?|items?)[.,!?;:]*\s*$/i, '')
    .replace(/(^|\s)[.,!?;:]+(?=\s|$)/g, '$1')
    .replace(/^[.,!?;:]+|[.,!?;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Store fallback query without price constraints
  const fallbackQuery = keywords;

  return { keywords, minPrice, maxPrice, fallbackQuery, hasPriceConstraint };
}

export function AISearchBar() {
  const [speechRecognitionFactory] = useState<SpeechRecognitionConstructor | null>(() => {
    if (typeof window === 'undefined') return null;
    const speechWindow = window as SpeechRecognitionWindow;
    return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition || null;
  });
  const sttSupported = !!speechRecognitionFactory;
  const [query, setQuery] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('voice_query') ?? '';
  });
  const [aiMode, setAiMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>(() => {
    if (typeof window === 'undefined') return 'idle';
    if (!speechRecognitionFactory) return 'unsupported';
    return new URLSearchParams(window.location.search).has('voice_query') ? 'submitted' : 'idle';
  });
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceSessionIdRef = useRef(0);
  const activeVoiceSessionRef = useRef<number | null>(null);
  const recognizedTranscriptRef = useRef('');
  const submittedVoiceQueryRef = useRef<string | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeVoiceSessionRef.current = null;
      recognitionRef.current?.abort();
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, []);

  const finishListening = (action: 'submit' | 'edit' | 'cancel') => {
    const sessionId = activeVoiceSessionRef.current;
    if (sessionId === null) return;

    activeVoiceSessionRef.current = null;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    setIsListening(false);

    const transcript = recognizedTranscriptRef.current.trim();
    if (action === 'cancel') {
      try { recognitionRef.current?.abort(); } catch { /* Already stopped. */ }
      recognizedTranscriptRef.current = '';
      setQuery('');
      setVoiceStatus('stopped');
      inputRef.current?.focus();
      return;
    }

    try { recognitionRef.current?.stop(); } catch { /* Recognition may already have ended. */ }

    if (action === 'edit') {
      setQuery(transcript);
      setVoiceStatus('stopped');
      inputRef.current?.focus();
      return;
    }

    if (!transcript || submittedVoiceQueryRef.current === transcript) {
      setVoiceStatus('no-speech');
      toast.info('No speech detected. Try again or type your search.');
      return;
    }

    submittedVoiceQueryRef.current = transcript;
    setQuery(transcript);
    setVoiceStatus('submitting');
    void submitQuery(transcript, false, transcript)
      .catch((error) => {
        console.error('Failed to submit voice search:', error);
        setVoiceStatus('failed');
        toast.error('Could not search the catalogue. Please try again.');
      })
      .finally(() => {
        setVoiceStatus((status) => status === 'submitting' ? 'submitted' : status);
      });
  };

  const resetSilenceTimer = (sessionId: number) => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      if (activeVoiceSessionRef.current !== sessionId) return;
      if (recognizedTranscriptRef.current.trim()) {
        finishListening('submit');
      } else {
        finishListening('edit');
        setVoiceStatus('no-speech');
      }
    }, 5000);
  };

  const startListening = () => {
    if (!sttSupported || !speechRecognitionFactory) {
      setVoiceStatus('unsupported');
      toast.error('Voice search is not supported in this browser');
      return;
    }

    if (activeVoiceSessionRef.current !== null || voiceStatus === 'submitting') return;

    if (aiMode) setAiMode(false);

    const sessionId = ++voiceSessionIdRef.current;
    try {
      recognitionRef.current = new speechRecognitionFactory();
    } catch (error) {
      console.error('Failed to create speech recognition:', error);
      setVoiceStatus('failed');
      toast.error('Failed to start voice search. Please try again.');
      return;
    }

    const recognition = recognitionRef.current;
    activeVoiceSessionRef.current = sessionId;
    recognizedTranscriptRef.current = '';
    submittedVoiceQueryRef.current = null;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      if (activeVoiceSessionRef.current !== sessionId) return;
      resetSilenceTimer(sessionId);
      const finalParts: string[] = [];
      const interimParts: string[] = [];
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim();
        if (!transcript) continue;
        if (result.isFinal) {
          finalParts.push(transcript);
        } else {
          interimParts.push(transcript);
        }
      }

      const finalTranscript = finalParts.join(' ').replace(/\s+/g, ' ').trim();
      const interimTranscript = interimParts.join(' ').replace(/\s+/g, ' ').trim();
      const visibleTranscript = [finalTranscript, interimTranscript].filter(Boolean).join(' ').replace(/\\s+/g, ' ').trim();
      recognizedTranscriptRef.current = visibleTranscript;
      if (visibleTranscript) setQuery(visibleTranscript);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (activeVoiceSessionRef.current !== sessionId) return;
      console.error('Speech recognition error:', event.error);
      setIsListening(false);

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        activeVoiceSessionRef.current = null;
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        setVoiceStatus('permission-denied');
        toast.error('Microphone access denied. Enable it in browser settings or type your search.');
      } else if (event.error === 'no-speech' && !recognizedTranscriptRef.current.trim()) {
        activeVoiceSessionRef.current = null;
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        setVoiceStatus('no-speech');
        toast.info('No speech detected. Try again or type your search.');
      } else {
        setVoiceStatus('interrupted');
        if (!recognizedTranscriptRef.current.trim()) {
          activeVoiceSessionRef.current = null;
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          toast.error('Voice search was interrupted. Please try again.');
        }
      }
    };

    recognition.onend = () => {
      if (activeVoiceSessionRef.current !== sessionId) return;
      setIsListening(false);
      const transcript = recognizedTranscriptRef.current.trim();
      setVoiceStatus(transcript ? 'interrupted' : 'no-speech');
      // Do not submit on onend: browser implementations can end recognition
      // before the user has finished their intended sentence. The silence timer
      // or an explicit Done action is the only voice-submit trigger.
    };

    try {
      recognition.start();
      setIsListening(true);
      setVoiceStatus('listening');
      resetSilenceTimer(sessionId);
    } catch (error) {
      activeVoiceSessionRef.current = null;
      setIsListening(false);
      console.error('Failed to start speech recognition:', error);
      const denied = error instanceof DOMException && error.name === 'NotAllowedError';
      setVoiceStatus(denied ? 'permission-denied' : 'failed');
      toast.error(denied
        ? 'Microphone access denied. Enable it in browser settings or type your search.'
        : 'Failed to start voice search. Please try again.');
    }
  };

  const stopListening = () => finishListening('cancel');

  const toggleListening = () => {
    if (activeVoiceSessionRef.current !== null) {
      finishListening('edit');
    } else {
      startListening();
    }
  };

  const submitQuery = async (searchQuery: string, useAI: boolean, voiceTranscript?: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    if (useAI) {
      // AI-parsed search
      setLoading(true);
      try {
        const { data, error } = await invokeAIAssistant('parse_search', { query: trimmed });

        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'AI search failed');

        const filters = data.data;
        const params = new URLSearchParams();

        if (filters.keywords) params.set('q', filters.keywords);
        if (filters.category) params.set('category', filters.category);

        const readCleanString = (v: any, maxLen = 40): string | undefined => {
          if (typeof v !== 'string' || v.trim().length === 0 || v.trim().length > maxLen) return undefined;
          return v.trim();
        };

        const productType = readCleanString(filters.productType);
        const brand = readCleanString(filters.brand);
        if (productType) params.set('type', productType);
        if (brand) params.set('brand', brand);

        const COLOR_VOCAB = ['black', 'white', 'navy', 'red', 'blue', 'green', 'grey', 'olive', 'brown', 'beige', 'yellow', 'orange', 'pink', 'purple', 'teal'];
        const rawColor = readCleanString(filters.color, 20);
        const color = rawColor ? rawColor.toLowerCase() : undefined;
        if (color && COLOR_VOCAB.includes(color)) params.set('color', color);

        const readPrice = (v: any): number | undefined => {
          if (v === null || v === undefined || v === '') return undefined;
          const n = Number(v);
          return Number.isFinite(n) && n >= 0 ? n : undefined;
        };

        const aiMin = readPrice(filters.minPrice);
        const aiMax = readPrice(filters.maxPrice);

        let minPrice = aiMin;
        let maxPrice = aiMax;
        if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
          minPrice = undefined;
          maxPrice = undefined;
        }

        if (minPrice !== undefined) params.set('minPrice', String(minPrice));
        if (maxPrice !== undefined) params.set('maxPrice', String(maxPrice));
        if (filters.sortBy) params.set('sort', filters.sortBy);

        if (params.size === 0) {
          throw new Error('AI search parsed no usable filters');
        }

        navigate(`/search?${params.toString()}`);
      } catch (err: any) {
        if (isGuestAILimitError(err)) return;
        toast.error('AI search didn’t return results — showing regular search instead.', { description: trimmed });
        navigate(`/search?q=${encodeURIComponent(trimmed)}`);
      } finally {
        setLoading(false);
      }
    } else {
      // Regular text or voice search with deterministic parsing
      const parsed = parseVoiceQuery(trimmed);
      const params = new URLSearchParams();

      if (parsed.keywords) params.set('q', parsed.keywords);
      if (parsed.minPrice !== undefined) params.set('minPrice', String(parsed.minPrice));
      if (parsed.maxPrice !== undefined) params.set('maxPrice', String(parsed.maxPrice));
      if (parsed.hasPriceConstraint) params.set('voice_price_constraint', 'true');
      if (voiceTranscript) params.set('voice_query', voiceTranscript);

      navigate(`/search?${params.toString()}`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeVoiceSessionRef.current !== null) return;

    const trimmed = query.trim();
    if (submittedVoiceQueryRef.current === trimmed) return;
    void submitQuery(trimmed, aiMode);
  };

  const handleExampleClick = (example: string) => {
    setQuery(example);
    if (aiMode) {
      // Trigger AI search with the example
      setLoading(true);
      invokeAIAssistant('parse_search', { query: example }).then(({ data, error }) => {
        if (error || !data?.success) {
          toast.error('AI search didn’t return results — showing regular search instead.', { description: example });
          navigate(`/search?q=${encodeURIComponent(example)}`);
          return;
        }
        const filters = data.data;
        const params = new URLSearchParams();
        if (filters.keywords) params.set('q', filters.keywords);
        if (filters.category) params.set('category', filters.category);
        const readCleanString = (v: any, maxLen = 40): string | undefined => {
          if (typeof v !== 'string' || v.trim().length === 0 || v.trim().length > maxLen) return undefined;
          return v.trim();
        };
        const productType = readCleanString(filters.productType);
        const brand = readCleanString(filters.brand);
        if (productType) params.set('type', productType);
        if (brand) params.set('brand', brand);
        const COLOR_VOCAB = ['black', 'white', 'navy', 'red', 'blue', 'green', 'grey', 'olive', 'brown', 'beige', 'yellow', 'orange', 'pink', 'purple', 'teal'];
        const rawColor = readCleanString(filters.color, 20);
        const color = rawColor ? rawColor.toLowerCase() : undefined;
        if (color && COLOR_VOCAB.includes(color)) params.set('color', color);
        const readPrice = (v: any): number | undefined => {
          if (v === null || v === undefined || v === '') return undefined;
          const n = Number(v);
          return Number.isFinite(n) && n >= 0 ? n : undefined;
        };
        const aiMin = readPrice(filters.minPrice);
        const aiMax = readPrice(filters.maxPrice);
        let minPrice = aiMin;
        let maxPrice = aiMax;
        if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
          minPrice = undefined;
          maxPrice = undefined;
        }
        if (minPrice !== undefined) params.set('minPrice', String(minPrice));
        if (maxPrice !== undefined) params.set('maxPrice', String(maxPrice));
        if (filters.sortBy) params.set('sort', filters.sortBy);
        if (params.size === 0) {
          navigate(`/search?q=${encodeURIComponent(example)}`);
          return;
        }
        navigate(`/search?${params.toString()}`);
      }).catch((err) => {
        if (isGuestAILimitError(err)) return;
        toast.error('AI search didn’t return results — showing regular search instead.', { description: example });
        navigate(`/search?q=${encodeURIComponent(example)}`);
      }).finally(() => {
        setLoading(false);
      });
    } else {
      navigate(`/search?q=${encodeURIComponent(example)}`);
    }
  };

  const examples = aiMode ? AI_EXAMPLES : REGULAR_EXAMPLES;
  const voiceStatusMessages: Record<VoiceStatus, string> = {
    idle: 'Microphone idle. Type a search or select the microphone.',
    listening: 'Listening. Speak a product request or select the microphone to stop.',
    submitting: 'Speech recognised. Searching the product catalogue.',
    submitted: 'Speech recognised. Your catalogue search has been submitted.',
    'no-speech': 'No speech detected. Try again or type your search.',
    'permission-denied': 'Microphone permission denied. You can still type your search.',
    unsupported: 'Voice search is unavailable in this browser. You can type your search.',
    interrupted: 'Voice search was interrupted. Try again or edit the transcript.',
    failed: 'Voice search failed. Try again or type your search.',
    stopped: 'Listening stopped. You can continue typing.',
  };

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} aria-busy={loading || isListening || voiceStatus === 'submitting'}>
        <div className="relative flex items-center">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {loading ? (
              <Loader2 aria-hidden="true" className="w-5 h-5 text-muted-foreground animate-spin" />
            ) : (
              <Search aria-hidden="true" className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          <span role="status" className="sr-only">
            {loading ? 'Searching...' : ''}
          </span>
          <input
            ref={inputRef}
            type="text"
            aria-label={aiMode ? 'Ask AI to search products' : 'Search products'}
            aria-describedby="voice-search-status"
            placeholder={aiMode ? 'Ask AI to find what you need…' : 'Search products by name or type…'}
            value={query}
            onChange={(e) => {
              if (activeVoiceSessionRef.current !== null) finishListening('edit');
              submittedVoiceQueryRef.current = null;
              setVoiceStatus('idle');
              setQuery(e.target.value);
            }}
            className={`w-full pl-10 pr-20 py-2 bg-muted border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all ${
              aiMode ? 'border-primary/50 ring-1 ring-primary/20' : 'border-border'
            }`}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              type="button"
              onClick={toggleListening}
              aria-label={activeVoiceSessionRef.current !== null ? 'Stop voice input and keep transcript for editing' : sttSupported ? 'Start voice search' : 'Voice search unavailable'}
              aria-pressed={activeVoiceSessionRef.current !== null}
              disabled={!sttSupported || voiceStatus === 'submitting'}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                isListening
                  ? 'bg-destructive text-destructive-foreground animate-pulse'
                  : 'bg-muted text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50'
              }`}
              title={isListening ? 'Stop and edit' : sttSupported ? 'Voice search' : 'Voice search unavailable'}
            >
              {isListening ? <MicOff aria-hidden="true" className="w-3 h-3" /> : <Mic aria-hidden="true" className="w-3 h-3" />}
            </button>
            <button
              type="button"
              onClick={() => {
                const nextMode = !aiMode;
                setAiMode(nextMode);
                setQuery('');
                stopListening();
                inputRef.current?.focus();
              }}
              aria-pressed={aiMode}
              aria-label={aiMode ? 'Switch to regular search' : 'Switch to AI search'}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                aiMode
                  ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
              title={aiMode ? 'Switch to regular search' : 'Switch to AI search'}
            >
              <Sparkles className={`w-3 h-3 ${aiMode ? 'animate-pulse' : ''}`} />
              AI
            </button>
          </div>
        </div>
      </form>
      {activeVoiceSessionRef.current !== null && (
        <div className="mt-2 flex items-center gap-3 text-xs" role="group" aria-label="Voice search controls">
          <span className="text-muted-foreground">{isListening ? 'Listening. Five seconds of silence submits your search.' : 'Recognition paused. Review your transcript.'}</span>
          <button type="button" onClick={() => finishListening('submit')} disabled={!recognizedTranscriptRef.current.trim()} className="font-semibold underline disabled:opacity-40">Done</button>
          <button type="button" onClick={() => finishListening('edit')} className="font-semibold underline">Stop &amp; Edit</button>
          <button type="button" onClick={() => finishListening('cancel')} className="font-semibold underline">Cancel</button>
        </div>
      )}
      <p
        id="voice-search-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={voiceStatus === 'idle' ? 'sr-only' : 'mt-1 text-xs text-muted-foreground'}
      >
        {voiceStatusMessages[voiceStatus]}
      </p>
      <div className="flex flex-wrap gap-1.5 mt-2 md:hidden">
        {examples.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => handleExampleClick(example)}
            className="px-2.5 py-1 text-xs text-muted-foreground bg-muted/50 hover:bg-muted border border-border/50 rounded-full transition-colors"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}
