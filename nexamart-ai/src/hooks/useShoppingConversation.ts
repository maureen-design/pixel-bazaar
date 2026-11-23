import { useState, useEffect, useCallback, useRef } from 'react';
import {
  sendShoppingConversationMessage,
  generateRequestId,
  isGuestAILimitError,
  type ShoppingConversationTurn,
  type ShoppingConversationProduct,
} from '../lib/aiAssistantClient';

export interface ChatMessage {
  id: string;
  requestId?: string;
  role: 'user' | 'assistant';
  content: string;
  recommendations?: ShoppingConversationProduct[];
  timestamp: number;
  status?: 'sending' | 'success' | 'error';
  errorMessage?: string;
}

const SESSION_STORAGE_KEY = 'nexamart_shopping_conversation_session';

const DEFAULT_SUGGESTIONS = [
  'Samsung phones under KSh 20,000',
  'Trending running shoes',
  'Laptops for work and study',
  'Gift ideas under KSh 5,000',
];

export function useShoppingConversation(initialCategoryName?: string | null) {
  const [conversationAnnouncement, setConversationAnnouncement] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Fallback to fresh session if storage read fails
    }

    const greetingContent = initialCategoryName
      ? `Hello! I'm Nexa, your AI shopping assistant. I see you're browsing ${initialCategoryName}. Tell me what you're looking for, ask for recommendations, or compare options!`
      : `Hello! I'm Nexa, your AI shopping assistant. Tell me what you're looking for, ask for product recommendations, or compare items across the catalogue.`;

    return [
      {
        id: 'welcome-message',
        role: 'assistant',
        content: greetingContent,
        timestamp: Date.now(),
        status: 'success',
      },
    ];
  });

  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(() => {
    if (initialCategoryName) {
      return [
        `Best ${initialCategoryName} under KSh 10,000`,
        `Top-rated ${initialCategoryName}`,
        `Affordable ${initialCategoryName}`,
      ];
    }
    return DEFAULT_SUGGESTIONS;
  });

  // Save successful turns to session storage
  useEffect(() => {
    try {
      const persistable = messages.filter((m) => m.status === 'success' || !m.status);
      if (persistable.length > 0) {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(persistable));
      }
    } catch {
      // Non-blocking if storage is full or restricted
    }
  }, [messages]);

  const inFlightRef = useRef(false);

  const sendMessage = useCallback(
    async (rawContent: string, retryForRequestId?: string) => {
      const content = rawContent.trim();
      if (!content || inFlightRef.current) return;

      const isRetry = Boolean(retryForRequestId);
      const requestId = retryForRequestId || generateRequestId();
      const userMessageId = isRetry
        ? messages.find((m) => m.requestId === retryForRequestId)?.id || generateRequestId()
        : generateRequestId();

      inFlightRef.current = true;
      setIsLoading(true);
      setConversationAnnouncement(`Sending your message to Nexa: "${content}"`);

      if (isRetry) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.requestId === retryForRequestId
              ? { ...msg, status: 'sending', errorMessage: undefined }
              : msg
          )
        );
      } else {
        const newUserMessage: ChatMessage = {
          id: userMessageId,
          requestId,
          role: 'user',
          content,
          timestamp: Date.now(),
          status: 'sending',
        };
        setMessages((prev) => [...prev, newUserMessage]);
      }

      // Build bounded history from completed messages prior to this user message
      const historyTurns: ShoppingConversationTurn[] = [];
      for (const msg of messages) {
        if (msg.status === 'error' || msg.id === userMessageId) continue;
        if (msg.role === 'user' || msg.role === 'assistant') {
          historyTurns.push({
            role: msg.role,
            content: msg.content.slice(0, 500),
          });
        }
      }
      const boundedHistory = historyTurns.slice(-8);

      try {
        const response = await sendShoppingConversationMessage(content, boundedHistory, requestId);

        if (!response.success || !response.data) {
          throw new Error(response.error || 'Nexa was unable to process your request.');
        }

        const reply = response.data.reply;
        const recommendations = response.data.recommendations || [];

        const countAnnouncement = recommendations.length > 0
          ? ` ${recommendations.length} recommended products are listed below.`
          : '';
        setConversationAnnouncement(`Nexa replied: "${reply}"${countAnnouncement}`);

        setMessages((prev) => {
          const updated = prev.map((msg) =>
            msg.requestId === requestId
              ? { ...msg, status: 'success' as const }
              : msg
          );
          const assistantMessage: ChatMessage = {
            id: generateRequestId(),
            role: 'assistant',
            content: reply,
            recommendations,
            timestamp: Date.now(),
            status: 'success',
          };
          return [...updated, assistantMessage];
        });

        // Generate contextual suggestions
        if (recommendations.length >= 2) {
          setSuggestions([
            'Compare these products',
            'Show me something cheaper',
            'Which one has the highest rating?',
            'Are these currently in stock?',
          ]);
        } else if (recommendations.length === 1) {
          setSuggestions([
            'Show me alternatives to this',
            'Does this have different colors or sizes?',
            'What do customers consider before buying it?',
          ]);
        } else {
          setSuggestions([
            'Show me other popular categories',
            'What are the best deals today?',
            'Search for phones or laptops',
          ]);
        }
      } catch (err: unknown) {
        const isGuestLimit = isGuestAILimitError(err);
        const errMessage =
          err instanceof Error
            ? err.message
            : typeof err === 'object' && err !== null && 'message' in err
              ? String((err as { message: unknown }).message)
              : undefined;
        const errorMessage = isGuestLimit
          ? 'You have reached the free guest AI limit. Create a free account to continue chatting with Nexa.'
          : errMessage || 'Nexa could not respond right now. Please try again.';

        setConversationAnnouncement(`Error: ${errorMessage}. An inline retry button is available.`);

        setMessages((prev) =>
          prev.map((msg) =>
            msg.requestId === requestId
              ? { ...msg, status: 'error' as const, errorMessage }
              : msg
          )
        );
      } finally {
        inFlightRef.current = false;
        setIsLoading(false);
      }
    },
    [messages]
  );

  const retryMessage = useCallback(
    (messageId: string) => {
      const msg = messages.find((m) => m.id === messageId);
      if (msg && msg.role === 'user' && msg.requestId) {
        sendMessage(msg.content, msg.requestId);
      }
    },
    [messages, sendMessage]
  );

  const resetConversation = useCallback(() => {
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Non-blocking
    }
    const greetingContent = initialCategoryName
      ? `Hello! I'm Nexa, your AI shopping assistant. I see you're browsing ${initialCategoryName}. Tell me what you're looking for, ask for recommendations, or compare options!`
      : `Hello! I'm Nexa, your AI shopping assistant. Tell me what you're looking for, ask for product recommendations, or compare items across the catalogue.`;

    setConversationAnnouncement('New conversation started. Previous messages cleared.');
    setMessages([
      {
        id: generateRequestId(),
        role: 'assistant',
        content: greetingContent,
        timestamp: Date.now(),
        status: 'success',
      },
    ]);
    setSuggestions(
      initialCategoryName
        ? [
            `Best ${initialCategoryName} under KSh 10,000`,
            `Top-rated ${initialCategoryName}`,
            `Affordable ${initialCategoryName}`,
          ]
        : DEFAULT_SUGGESTIONS
    );
  }, [initialCategoryName]);

  return {
    messages,
    isLoading,
    suggestions,
    conversationAnnouncement,
    sendMessage,
    retryMessage,
    resetConversation,
  };
}
