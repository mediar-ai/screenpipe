import { useEffect, useState } from 'react';
import localforage from 'localforage';
import { Conversation } from '../types/history';

const HISTORY_KEY = 'screenpipe-conversation-history';

export function useConversationHistory() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const stored = await localforage.getItem<Conversation[]>(HISTORY_KEY);
      setConversations(stored || []);
    } catch (error) {
      console.error('failed to load conversations:', error);
    }
    setIsLoading(false);
  };

  const saveConversations = async (updated: Conversation[]) => {
    try {
      await localforage.setItem(HISTORY_KEY, updated);
      setConversations(updated);
    } catch (error) {
      console.error('failed to save conversations:', error);
    }
  };

  const addMessage = async (
    conversationId: string | null,
    type: 'search' | 'ai',
    content: string,
    searchQuery?: any
  ) => {
    const timestamp = new Date().toISOString();
    const messageId = crypto.randomUUID();

    if (!conversationId) {
      // create new conversation
      const newConversation: Conversation = {
        id: crypto.randomUUID(),
        title: content.slice(0, 30) + (content.length > 30 ? '...' : ''),
        createdAt: timestamp,
        lastUpdatedAt: timestamp,
        messages: [{
          id: messageId,
          type,
          content,
          timestamp,
          searchQuery
        }]
      };
      
      const updated = [newConversation, ...conversations];
      await saveConversations(updated);
      setCurrentConversationId(newConversation.id);
      return newConversation.id;
    }

    // add to existing conversation
    const updated = conversations.map(conv => {
      if (conv.id === conversationId) {
        return {
          ...conv,
          lastUpdatedAt: timestamp,
          messages: [...conv.messages, {
            id: messageId,
            type,
            content,
            timestamp,
            searchQuery
          }]
        };
      }
      return conv;
    });

    await saveConversations(updated);
    return conversationId;
  };

  const deleteConversation = async (id: string) => {
    const updated = conversations.filter(c => c.id !== id);
    await saveConversations(updated);
    if (currentConversationId === id) {
      setCurrentConversationId(null);
    }
  };

  return {
    conversations,
    currentConversationId,
    setCurrentConversationId,
    addMessage,
    deleteConversation,
    isLoading
  };
} 