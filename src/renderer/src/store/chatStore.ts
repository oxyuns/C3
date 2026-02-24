import { create } from 'zustand';

export interface SuggestOption {
  id: string;
  label: string;
  payload?: string;
}

export interface FormField {
  id: string;
  label: string;
  optional?: boolean;
  placeholder?: string;
  defaultValue?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  options?: SuggestOption[];
  formFields?: FormField[];
}

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  addMessage: (msg: Omit<ChatMessage, 'id'>) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  clear: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isLoading: false,
  error: null,
  addMessage: (msg) =>
    set((s) => ({
      messages: [...s.messages, { ...msg, id: crypto.randomUUID() }],
    })),
  setLoading: (v) => set({ isLoading: v }),
  setError: (e) => set({ error: e }),
  clear: () => set({ messages: [], error: null }),
}));
