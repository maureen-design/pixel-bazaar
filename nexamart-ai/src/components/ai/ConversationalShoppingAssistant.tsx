import { useState, useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
  RotateCcw,
  Loader2,
  RefreshCw,
  AlertCircle,
  HelpCircle,
  SlidersHorizontal,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Button } from '../ui/button';
import { ConversationalProductCard } from './ConversationalProductCard';
import { useShoppingConversation } from '../../hooks/useShoppingConversation';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { useSpeechSynthesis } from '../../hooks/useSpeechSynthesis';

interface ConversationalShoppingAssistantProps {
  initialCategoryName?: string | null;
  onSwitchToGuided?: () => void;
}

export function ConversationalShoppingAssistant({
  initialCategoryName,
  onSwitchToGuided,
}: ConversationalShoppingAssistantProps) {
  const {
    messages,
    isLoading,
    suggestions,
    conversationAnnouncement,
    sendMessage,
    retryMessage,
    resetConversation,
  } = useShoppingConversation(initialCategoryName);

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const micButtonRef = useRef<HTMLButtonElement>(null);

  const {
    isSupported: isVoiceSupported,
    isListening,
    isSessionActive: isVoiceSessionActive,
    status: voiceStatus,
    announcement: voiceAnnouncement,
    startListening,
    stopListening,
  } = useSpeechRecognition({
    onInterimTranscript: (interim) => {
      setInput(interim);
    },
    onFinalTranscript: (final) => {
      setInput('');
      sendMessage(final);
      // Return focus to input after voice submission
      inputRef.current?.focus();
    },
  });

  const {
    isSupported: isSpeechSupported,
    isSpeaking,
    speakingMessageId,
    speechAnnouncement,
    speak,
    stopSpeaking,
  } = useSpeechSynthesis();

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, isListening]);

  useEffect(() => {
    // Focus input on load for immediate typing or keyboard accessibility
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (isVoiceSessionActive) {
      // A manual send is one turn; discard the microphone session to prevent a later duplicate.
      stopListening(false, true);
    }
    if (isSpeaking) stopSpeaking();
    if (!text || isLoading) return;
    sendMessage(text);
    setInput('');
    inputRef.current?.focus();
  };

  const handleMicClick = () => {
    if (isLoading) return;
    if (isVoiceSessionActive) {
      // A manual mic toggle stops capture and keeps the transcript editable.
      stopListening(false);
      inputRef.current?.focus();
    } else {
      // Request speech cancellation before opening the microphone.
      if (isSpeaking) stopSpeaking();
      startListening();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (isLoading) return;
    if (isVoiceSessionActive) {
      stopListening(false, true);
    }
    // Stop any ongoing speech
    if (isSpeaking) {
      stopSpeaking();
    }
    sendMessage(suggestion);
    inputRef.current?.focus();
  };

  const handleAskAboutProduct = (question: string) => {
    if (isLoading) return;
    if (isListening) {
      stopListening(false);
    }
    // Stop any ongoing speech
    if (isSpeaking) {
      stopSpeaking();
    }
    sendMessage(question);
    inputRef.current?.focus();
  };

  const handleReset = () => {
    if (isListening) {
      stopListening(false);
    }
    // Stop any ongoing speech
    if (isSpeaking) {
      stopSpeaking();
    }
    resetConversation();
    setInput('');
    inputRef.current?.focus();
  };

  const charCount = input.length;
  const isOverLimit = charCount > 1000;

  return (
    <section
      role="region"
      aria-label="Nexa Conversational Shopping Assistant"
      className="flex flex-col h-full overflow-hidden bg-background"
    >
      {/* Accessible Live Regions for Screen Readers */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="voice-announcement-region"
      >
        {voiceAnnouncement}
      </div>

      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="conversation-announcement-region"
      >
        {conversationAnnouncement}
      </div>

      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="speech-announcement-region"
      >
        {speechAnnouncement}
      </div>

      {/* Sub-header with actions */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative" aria-hidden="true">
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-brand to-brand-dark flex items-center justify-center text-white shadow-xs">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <span
              className={`absolute bottom-0 right-0 w-2 h-2 rounded-full ring-2 ring-background ${
                isListening ? 'bg-amber-500 animate-ping' : 'bg-emerald-500'
              }`}
            />
          </div>
          <div>
            <h3 className="text-sm font-semibold leading-none text-foreground flex items-center gap-1.5">
              <span>Nexa</span>
              <span className="text-[10px] font-normal px-1.5 py-0.2 rounded-full bg-primary/10 text-primary">
                AI Shopping Assistant
              </span>
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isListening ? 'Listening via microphone...' : 'Type or speak your shopping requests'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5" role="toolbar" aria-label="Assistant controls">
          {onSwitchToGuided && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onSwitchToGuided}
              aria-label="Switch to guided questionnaire mode"
              className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
              title="Switch to guided questionnaire mode"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
              <span>Guided Mode</span>
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            aria-label="Start a new conversation and clear current shopping history"
            className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
            title="Start a new conversation"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
            <span>New Chat</span>
          </Button>
        </div>
      </header>

      {/* Voice Status Alert Banner (Accessible visual & screen status) */}
      {isVoiceSessionActive && (
        <div
          role="status"
          aria-live="polite"
          className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-between text-xs text-primary shrink-0 animate-in fade-in duration-200"
        >
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
            <span className="font-medium">
              {isListening ? 'Listening... Speak your shopping request.' : 'Speech capture paused. Confirm, edit, or cancel your transcript.'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                stopListening(true);
              }}
              aria-label="Done. Submit the recognized voice message"
              disabled={!input.trim()}
              className="text-xs font-semibold underline disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-primary rounded-xs"
            >
              Done
            </button>
            <button
              type="button"
              onClick={() => {
                stopListening(false);
                inputRef.current?.focus();
              }}
              aria-label="Stop listening and keep the transcript for editing"
              className="text-xs underline font-semibold hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-primary rounded-xs"
            >
              Stop &amp; Edit
            </button>
            <button
              type="button"
              onClick={() => {
                stopListening(false, true);
                setInput('');
                inputRef.current?.focus();
              }}
              aria-label="Cancel voice recording and discard transcript"
              className="text-xs underline font-semibold hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-primary rounded-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {voiceStatus === 'permission-denied' && (
        <div
          role="alert"
          className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 shrink-0"
        >
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Microphone access was denied. You can continue shopping by typing below.</span>
        </div>
      )}

      {/* Messages Thread */}
      <div
        role="log"
        aria-label="Shopping conversation thread"
        aria-relevant="additions"
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4 focus:outline-hidden"
        tabIndex={0}
      >
        {messages.map((message, idx) => (
          <div key={message.id || idx} className="space-y-2.5">
            {message.role === 'user' ? (
              // User message bubble
              <article
                aria-label={`You said: ${message.content}`}
                className="flex justify-end"
              >
                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tr-xs px-4 py-2.5 text-sm shadow-xs ${
                    message.status === 'error'
                      ? 'bg-destructive/10 text-destructive border border-destructive/30'
                      : 'bg-primary text-primary-foreground'
                  }`}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>

                  {message.status === 'error' && (
                    <div
                      role="alert"
                      className="mt-2 pt-2 border-t border-destructive/20 flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>{message.errorMessage || 'Failed to deliver message'}</span>
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => retryMessage(message.id)}
                        aria-label={`Retry sending message: ${message.content}`}
                        className="h-6 px-2 text-[11px] border-destructive/40 hover:bg-destructive/20 text-destructive focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <RefreshCw className="w-3 h-3 mr-1" aria-hidden="true" />
                        <span>Retry</span>
                      </Button>
                    </div>
                  )}
                </div>
              </article>
            ) : (
              // Assistant message bubble
              <article
                aria-label={`Nexa responded: ${message.content}`}
                className="flex items-start gap-2.5"
              >
                <div
                  className="w-7 h-7 rounded-full bg-gradient-to-tr from-brand to-brand-dark flex items-center justify-center text-white shrink-0 mt-0.5 shadow-xs"
                  aria-hidden="true"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </div>

                <div className="flex-1 max-w-[90%] sm:max-w-[85%] space-y-3">
                  <div className={`bg-muted/50 border border-border/80 rounded-2xl rounded-tl-xs px-4 py-3 text-sm text-foreground shadow-xs leading-relaxed ${
                    speakingMessageId === message.id ? 'ring-1 ring-primary/50' : ''
                  }`}>
                    <div className="flex justify-between items-start mb-2">
                      <p className="whitespace-pre-wrap flex-1">{message.content}</p>
                      {isSpeechSupported && (
                        <button
                          type="button"
                          onClick={() => {
                            if (speakingMessageId === message.id) {
                              stopSpeaking();
                            } else {
                              // Stop any ongoing speech first
                              if (isSpeaking) {
                                stopSpeaking();
                              }
                              // Start speaking this message
                              speak(
                                message.content,
                                message.id,
                                Array.isArray(message.recommendations) ? message.recommendations.length : 0
                              );
                            }
                          }}
                          aria-label={
                            speakingMessageId === message.id
                              ? 'Stop reading this response aloud'
                              : 'Read this response aloud'
                          }
                          className="ml-2 flex-shrink-0 p-1.5 rounded-md hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-primary transition-colors"
                          disabled={!isSpeechSupported}
                          title={
                            speakingMessageId === message.id
                              ? 'Stop reading aloud'
                              : 'Read aloud'
                          }
                        >
                          {speakingMessageId === message.id ? (
                            <VolumeX className="w-4 h-4 text-primary" aria-hidden="true" />
                          ) : (
                            <Volume2 className="w-4 h-4 text-muted-foreground hover:text-foreground" aria-hidden="true" />
                          )}
                        </button>
                      )}
                    </div>
                    {speakingMessageId === message.id && (
                      <div className="mt-2 pt-2 border-t border-border/40 text-xs text-muted-foreground flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-primary animate-pulse" aria-hidden="true" />
                        <span>Nexa is speaking this response aloud</span>
                      </div>
                    )}
                  </div>

                  {/* Render embedded product recommendations if present */}
                  {Array.isArray(message.recommendations) && message.recommendations.length > 0 && (
                    <section
                      aria-label={`Nexa recommended ${message.recommendations.length} products`}
                      className="space-y-2 pt-1"
                    >
                      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                        <span className="font-medium flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-primary" aria-hidden="true" />
                          <span>Recommended Products ({message.recommendations.length})</span>
                        </span>
                        {message.recommendations.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              handleSuggestionClick(
                                `Compare ${message.recommendations!.map((p) => p.name).slice(0, 3).join(' vs ')}`
                              )
                            }
                            aria-label={`Compare ${message.recommendations.length} recommended products`}
                            className="text-primary hover:underline text-[11px] font-medium focus-visible:ring-2 focus-visible:ring-primary rounded-xs"
                          >
                            Compare these
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {message.recommendations.map((product) => (
                          <ConversationalProductCard
                            key={product.id}
                            product={product}
                            onAskAbout={handleAskAboutProduct}
                          />
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              </article>
            )}
          </div>
        ))}

        {/* Loading state indicator */}
        {isLoading && (
          <div
            role="status"
            aria-label="Nexa is checking the catalogue and preparing your reply"
            className="flex items-start gap-2.5"
          >
            <div
              className="w-7 h-7 rounded-full bg-gradient-to-tr from-brand to-brand-dark flex items-center justify-center text-white shrink-0 mt-0.5 shadow-xs"
              aria-hidden="true"
            >
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            </div>
            <div className="bg-muted/50 border border-border/80 rounded-2xl rounded-tl-xs px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-primary animate-spin" aria-hidden="true" />
              <span>Nexa is checking the catalogue and preparing your reply...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion Chips */}
      {!isLoading && suggestions.length > 0 && (
        <nav
          aria-label="Suggested follow-up questions"
          className="px-4 py-2 border-t border-border/60 bg-muted/20 shrink-0"
        >
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            <span
              id="suggestions-label"
              className="text-[11px] text-muted-foreground font-medium shrink-0 flex items-center gap-1"
            >
              <HelpCircle className="w-3 h-3" aria-hidden="true" />
              <span>Suggestions:</span>
            </span>
            <div role="group" aria-labelledby="suggestions-label" className="flex items-center gap-1.5">
              {suggestions.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSuggestionClick(s)}
                  aria-label={`Ask: ${s}`}
                  className="whitespace-nowrap rounded-full bg-card hover:bg-primary/10 border border-border/80 hover:border-primary/40 px-3 py-1 text-xs text-foreground transition-all shrink-0 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </nav>
      )}

      {/* Input area with text and microphone controls */}
      <footer className="p-3 sm:p-4 border-t border-border bg-card shrink-0">
        <form onSubmit={handleSubmit} className="flex flex-col gap-1.5" aria-label="Chat input form">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  isListening
                    ? 'Listening... Speak now, or click microphone to stop'
                    : 'Ask Nexa about products, budgets, comparisons or specs...'
                }
                disabled={isLoading}
                maxLength={1000}
                aria-label="Ask Nexa a shopping question by typing or speaking"
                aria-describedby="nexa-char-count nexa-input-hint"
                className="w-full h-10 px-3.5 pr-14 rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary text-sm text-foreground placeholder:text-muted-foreground disabled:opacity-50 transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
              />
              <span
                id="nexa-char-count"
                aria-live="off"
                className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] pointer-events-none ${
                  charCount > 900 ? 'text-amber-500 font-bold' : 'text-muted-foreground/60'
                }`}
              >
                {charCount}/1000
              </span>
            </div>

            {/* Microphone button */}
            <Button
              ref={micButtonRef}
              type="button"
              variant={isListening ? 'destructive' : 'outline'}
              size="sm"
              disabled={isLoading || !isVoiceSupported}
              onClick={handleMicClick}
              aria-label={
                !isVoiceSupported
                  ? 'Voice input is not supported in this browser'
                  : isListening
                    ? 'Stop voice input. Microphone is currently listening'
                    : isSpeaking
                    ? 'Interrupt Nexa\'s speech and start microphone listening'
                    : 'Start voice input with microphone to speak your message'
              }
              aria-pressed={isListening}
              className={`h-10 w-10 p-0 rounded-xl shrink-0 transition-all focus-visible:ring-2 focus-visible:ring-primary ${
                isListening ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse' : ''
              }`}
              title={
                !isVoiceSupported
                  ? 'Microphone not supported in this browser'
                  : isListening
                    ? 'Stop listening'
                    : isSpeaking
                    ? 'Interrupt speech and speak'
                    : 'Speak with microphone'
              }
            >
              {isListening ? (
                <MicOff className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Mic className="w-4 h-4" aria-hidden="true" />
              )}
            </Button>

            {/* Send button */}
            <Button
              type="submit"
              size="sm"
              disabled={!input.trim() || isLoading || isOverLimit}
              aria-label="Send shopping message"
              className="h-10 px-4 rounded-xl shrink-0 focus-visible:ring-2 focus-visible:ring-primary"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="w-4 h-4" aria-hidden="true" />
              )}
            </Button>
          </div>

          <div id="nexa-input-hint" className="flex items-center justify-between text-[11px] text-muted-foreground/80 px-1">
            <span>
              Grounds advice in NexaMart catalogue inventory.
            </span>
            <span className="hidden sm:inline">
              Press Enter to send, or activate microphone to speak.
            </span>
          </div>
        </form>
      </footer>
    </section>
  );
}
