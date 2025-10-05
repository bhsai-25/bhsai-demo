



export interface GroundingChunk { web: { uri: string; title: string; } }

export type ChatMessage = {
    role: 'user' | 'model';
    text: string;
    image?: string;
    sources?: GroundingChunk[];
};

export type Chat = {
    title: string;
    messages: ChatMessage[];
};

export type StoredChat = Chat & {
    id: string;
    classNum: number;
    createdAt: number;
    isPinned?: boolean;
};

export type QuizQuestion = {
    question: string;
    options: string[];
    correctAnswerIndex: number;
    explanation: string;
};

export type SelectOption = {
  value: number | string;
  label: string;
  description?: string;
  isNew?: boolean;
  iconPath?: string;
};