import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Sparkles, Loader2, Mic, MicOff } from 'lucide-react';
import { invokeAIAssistant, isGuestAILimitError } from '../lib/aiAssistantClient';
import { toast } from 'sonner';

const REGULAR_EXAMPLES = ['Black shoes', 'Laptops', "Men's jackets"];
const AI_EXAMPLES = ['Black shoes under KES 5,000', 'Wireless headphones', "Men's jackets"];

export function AISearchBar() {
  const [query, setQuery] = useState('');
  const [aiMode, setAiMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [sttSupported, setSttSupported] = useState(false);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const autoSubmitRef = useRef<string | null>(null);

  // Feature detection for SpeechRecognition (client-side only)
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const supported = !!SpeechRecognition;
    speechRecognitionRef.current = SpeechRecognition;
    setSttSupported(supported);
    console.log('[Voice Search] STT supported:', supported);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, []);

  const resetSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    silenceTimerRef.current = setTimeout(() => {
      if (isListening) {
        stopListening();
        toast.info('Voice search stopped due to silence');
      }
    }, 8000); // 8 seconds of silence
  };

  const startListening = () => {
    if (!sttSupported || !speechRecognitionRef.current) {
      toast.error('Voice search is not supported in this browser');
      return;
    }

    if (!recognitionRef.current) {
      recognitionRef.current = new speechRecognitionRef.current();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        resetSilenceTimer();
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join('');
        setQuery(transcript);
        // Store final transcript for auto-submit
        if (event.results[event.results.length - 1].isFinal) {
          autoSubmitRef.current = transcript;
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          toast.error('Microphone access denied. Enable in browser settings to use voice search.');
        } else if (event.error === 'no-speech') {
          toast.info('No speech detected. Try again.');
        } else {
          toast.error('Voice search error. Please try again.');
        }
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }
        // Auto-submit if we have a non-empty final transcript
        const finalTranscript = autoSubmitRef.current;
        if (finalTranscript && finalTranscript.trim()) {
          // Small delay to allow UI to update, then submit
          setTimeout(() => {
            if (!loading) {
              handleSubmit(new Event('submit') as any);
            }
          }, 300);
        }
        autoSubmitRef.current = null;
      };
    }

    try {
      recognitionRef.current.start();
      setIsListening(true);
      resetSilenceTimer();
    } catch (error) {
      console.error('Failed to start speech recognition:', error);
      toast.error('Failed to start voice search. Please try again.');
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    if (aiMode) {
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
      // Regular text search
      navigate(`/search?q=${encodeURIComponent(trimmed)}`);
    }
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

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} aria-busy={loading}>
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
            placeholder={aiMode ? 'Ask AI to find what you need…' : 'Search products by name or type…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`w-full pl-10 pr-20 py-2 bg-muted border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all ${
              aiMode ? 'border-primary/50 ring-1 ring-primary/20' : 'border-border'
            }`}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {aiMode && sttSupported && (
              <button
                type="button"
                onClick={toggleListening}
                aria-label={isListening ? 'Stop voice search' : 'Start voice search'}
                aria-pressed={isListening}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                  isListening
                    ? 'bg-destructive text-destructive-foreground animate-pulse'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
                title={isListening ? 'Stop listening' : 'Voice search'}
              >
                {isListening ? (
                  <MicOff className="w-3 h-3" />
                ) : (
                  <Mic className="w-3 h-3" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => { setAiMode(!aiMode); setQuery(''); stopListening(); inputRef.current?.focus(); }}
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
