

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { marked } from 'marked';

// Helper function to convert file to base64
const fileToGenerativePart = async (file: File) => {
    const base64EncodedDataPromise = new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
    });
    return {
        inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
    };
};

// === Type Definitions ===
interface GroundingChunk { web: { uri: string; title: string; } }
type ChatMessage = {
    role: 'user' | 'model';
    text: string;
    image?: string;
    sources?: GroundingChunk[];
};
type Chat = {
    title: string;
    messages: ChatMessage[];
};
type QuizQuestion = {
    question: string;
    options: string[];
    correctAnswerIndex: number;
    explanation: string;
};


// === Reusable UI Components (Moved outside App for performance) ===

const BHSLogo = ({ className }: { className?: string }) => (
    <svg className={className} width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ strokeWidth: 1.5 }}>
        <defs>
            <linearGradient id="gemini-gradient-svg" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#F97721" />
                <stop offset="25%" stopColor="#F2A93B" />
                <stop offset="75%" stopColor="#88D7E4" />
                <stop offset="100%" stopColor="#2D79C7" />
            </linearGradient>
        </defs>
        <g className="logo-paths" stroke="currentColor">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 17L12 22L22 17" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 12L12 17L22 12" strokeLinecap="round" strokeLinejoin="round"/>
        </g>
    </svg>
);

const Icon = ({ path, size = 24 }: { path: string, size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d={path} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

const TypingIndicator = () => (
    <div className="typing-indicator">
        <span />
        <span />
        <span />
    </div>
);

const Message = React.memo(({ msg, isLastMessage, isLoading }: { msg: ChatMessage; isLastMessage: boolean; isLoading: boolean }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(msg.text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const showTyping = isLoading && isLastMessage && msg.role === 'model';
    
    // By memoizing the parsed markdown, we prevent expensive re-renders 
    // on every stream chunk.
    const htmlContent = useMemo(() => marked.parse(msg.text) as string, [msg.text]);

    return (
        <div className={`chat-message role-${msg.role}`}>
            {msg.role === 'model' && <div className="message-avatar"><BHSLogo /></div>}
            <div className="message-content-wrapper">
                <div className="message-content">
                    {msg.image && <img src={msg.image} alt="User upload" className="message-image" />}
                    <div dangerouslySetInnerHTML={{ __html: htmlContent }}></div>
                    
                    {showTyping && <TypingIndicator />}

                     {msg.sources && msg.sources.length > 0 && (
                        <div className="message-sources">
                            <hr />
                            <p><strong>Sources from the web:</strong></p>
                            <ol>{msg.sources.map((source, i) => (<li key={i}><a href={source.web.uri} target="_blank" rel="noopener noreferrer">{source.web.title || new URL(source.web.uri).hostname}</a></li>))}</ol>
                        </div>
                    )}
                </div>
                {msg.role === 'model' && msg.text && !showTyping && (
                     <button onClick={handleCopy} className="copy-btn" aria-label="Copy message">
                         {copied ? <Icon path="M20 6L9 17l-5-5" size={16} /> : <Icon path="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" size={16} />}
                     </button>
                )}
            </div>
        </div>
    );
});
Message.displayName = 'Message'; // Good practice for debugging with memo

const InitialClassSelector = ({ onSelectClass }: { onSelectClass: (grade: number) => void }) => (
    <div className="initial-class-selector">
        <BHSLogo />
        <h1 className="title-main"><span>Welcome to </span><span className="gemini-gradient-text">bhsAI</span></h1>
        <p className="subtitle">Your academic assistant from Birla High School Mukundapur</p>
        <p className="disclaimer-warning">Please be respectful and refrain from sending inappropriate messages.</p>
        <h2>Please select your class to begin</h2>
        <div className="class-grid">
            {Array.from({ length: 7 }, (_, i) => i + 6).map(grade => (
                <button key={grade} onClick={() => onSelectClass(grade)} className="class-button">
                    Class {grade}
                </button>
            ))}
        </div>
        <h2 style={{ marginTop: '32px' }}>Or select an exam stream</h2>
        <div className="class-grid" style={{ maxWidth: '350px' }}>
            <button key="jee" onClick={() => onSelectClass(13)} className="class-button">
                JEE
            </button>
            <button key="neet" onClick={() => onSelectClass(14)} className="class-button">
                NEET
            </button>
        </div>
        <p className="creator-credit">Created by Shreyansh and Aarush</p>
    </div>
);

const ChatWelcomeScreen = ({ suggestions, onSendMessage }: { suggestions: string[], onSendMessage: (message: string) => void }) => (
    <div className="chat-welcome-screen">
        <h1><span className="welcome-hi">Hi, </span><span className="gemini-gradient-text">Student</span></h1>
        <p>Your academic assistant is ready to help. What would you like to explore today?</p>
        <div className="prompt-suggestions">
            {suggestions?.map(p => (
                <button key={p} className="suggestion-btn" onClick={() => onSendMessage(p)}>{p}</button>
            ))}
        </div>
    </div>
);

const QuizModal = ({ onStart, onCancel, topic, setTopic }: { onStart: (e: React.FormEvent) => void, onCancel: () => void, topic: string, setTopic: (t: string) => void }) => (
    <div className="modal-overlay">
        <div className="modal-content">
            <h2>Start a Quiz</h2>
            <p>Enter a topic for your quiz based on your current class syllabus.</p>
            <form onSubmit={onStart}>
                <input
                    type="text"
                    className="modal-input"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g., Newton's Laws of Motion"
                    aria-label="Quiz topic"
                    autoFocus
                />
                <div className="modal-buttons">
                    <button type="button" className="modal-btn cancel" onClick={onCancel}>Cancel</button>
                    <button type="submit" className="modal-btn submit" disabled={!topic.trim()}>Start Quiz</button>
                </div>
            </form>
        </div>
    </div>
);

const QuizView = ({ question, onAnswerSelect, selectedAnswer }: { question: QuizQuestion; onAnswerSelect: (index: number) => void; selectedAnswer: number | null }) => {
    const hasAnswered = selectedAnswer !== null;
    return (
        <div className="quiz-view">
            <div className="chat-message role-model" style={{ maxWidth: '100%' }}>
                <div className="message-avatar"><BHSLogo /></div>
                <div className="message-content-wrapper">
                    <div className="message-content">
                        <div dangerouslySetInnerHTML={{ __html: marked.parse(question.question) as string }} />
                    </div>
                </div>
            </div>
            <div className="quiz-options">
                {question.options.map((option, index) => {
                    let buttonClass = 'quiz-option-btn';
                    if (hasAnswered) {
                        if (index === question.correctAnswerIndex) {
                            buttonClass += ' correct';
                        } else if (index === selectedAnswer) {
                            buttonClass += ' incorrect';
                        }
                    }
                    return (
                        <button key={index} className={buttonClass} onClick={() => onAnswerSelect(index)} disabled={hasAnswered}>
                            {option}
                        </button>
                    );
                })}
            </div>
            {hasAnswered && (
                <div className="quiz-explanation" dangerouslySetInnerHTML={{ __html: marked.parse(`**Explanation:** ${question.explanation}`) as string }}>
                </div>
            )}
        </div>
    );
};


const App = () => {
    // === State Management ===
    const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
    const [selectedClass, setSelectedClass] = useState<number | null>(() => {
        const savedClass = localStorage.getItem('selectedClass');
        return savedClass ? parseInt(savedClass, 10) : null;
    });
    
    const [chatHistories, setChatHistories] = useState<{ [classNum: number]: { [chatId: string]: Chat } }>(() => {
        const saved = localStorage.getItem('chatHistories');
        if (!saved) return {};
        const parsed = JSON.parse(saved);

        // Migration logic: check if the data is in the old format and convert it.
        const firstClassKey = Object.keys(parsed)[0];
        if (firstClassKey) {
            const firstChatIdKey = Object.keys(parsed[firstClassKey])[0];
            if (firstChatIdKey && Array.isArray(parsed[firstClassKey][firstChatIdKey])) {
                const migratedHistories: { [classNum: number]: { [chatId: string]: Chat } } = {};
                for (const classNum in parsed) {
                    migratedHistories[classNum] = {};
                    for (const chatId in parsed[classNum]) {
                        migratedHistories[classNum][chatId] = {
                            title: '',
                            messages: parsed[classNum][chatId]
                        };
                    }
                }
                localStorage.setItem('chatHistories', JSON.stringify(migratedHistories));
                return migratedHistories;
            }
        }
        return parsed;
    });

    const [activeChatIds, setActiveChatIds] = useState<{ [classNum: number]: string }>(() => {
        const saved = localStorage.getItem('activeChatIds');
        return saved ? JSON.parse(saved) : {};
    });

    const [input, setInput] = useState('');
    const [image, setImage] = useState<{ file: File, preview: string } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    const [isGoogleSearchEnabled, setGoogleSearchEnabled] = useState(true);
    const [isRecording, setIsRecording] = useState(false);
    const [showScrollTop, setShowScrollTop] = useState(false);
    
    // Quiz State
    const [showQuizModal, setShowQuizModal] = useState(false);
    const [quizTopic, setQuizTopic] = useState('');
    const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [userAnswers, setUserAnswers] = useState<(number | null)[]>([]);
    const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
    const [isQuizModeActive, setIsQuizModeActive] = useState(false);


    const chatEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const recognitionRef = useRef<any>(null); // For SpeechRecognition
    const chatAreaRef = useRef<HTMLDivElement>(null);

    const activeChatId = selectedClass ? activeChatIds[selectedClass] : null;
    const currentChat = (selectedClass && activeChatId && chatHistories[selectedClass]?.[activeChatId]);
    const currentMessages = currentChat?.messages || [];


    // === Data ===
    const promptSuggestions: { [key: number]: string[] } = {
        6: ["Explain the solar system.", "Who was the first emperor of the Mauryan dynasty?", "Summarize a story from the 'Honeysuckle' textbook."],
        7: ["What is the difference between acids and bases?", "Describe the function of the human heart.", "Explain the rise of the Mughal Empire."],
        8: ["What is a cell and what are its main parts?", "Explain the process of crop production.", "Describe the Indian Rebellion of 1857."],
        9: ["What are Newton's laws of motion?", "Explain the structure of an atom.", "Discuss the features of democracy."],
        10: ["Explain chemical reactions and equations.", "What were the causes of World War I?", "Describe the process of reflection of light by spherical mirrors."],
        11: ["Explain the concept of sets in mathematics.", "What is projectile motion?", "Discuss the fundamental rights in the Indian Constitution."],
        12: ["Explain electric charge and fields.", "Discuss the principles of inheritance and variation.", "What is the structure of a C++ program?"],
        13: ["Solve a challenging problem on rotational mechanics.", "Explain the concept of chemical equilibrium.", "What are some important topics in calculus for JEE?"], // JEE
        14: ["Describe the process of DNA replication.", "Explain the human endocrine system.", "What are the key concepts in organic chemistry for NEET?"] // NEET
    };
    
    const getSystemInstruction = (classNum: number | null): string => {
        if (!classNum) return '';
        let studentType = `Class ${classNum}`;
        let syllabusType = `NCERT syllabus for Class ${classNum}`;
    
        if (classNum === 13) {
            studentType = 'JEE aspirant';
            syllabusType = 'JEE (Mains and Advanced) syllabus';
        } else if (classNum === 14) {
            studentType = 'NEET aspirant';
            syllabusType = 'NEET syllabus';
        }
    
        return `You are bhsAI, an expert academic AI assistant for a ${studentType} from Birla High School Mukundapur. Your sole purpose is to provide accurate, strictly academic, and informational answers based on the ${syllabusType}. You must politely decline any request that is not related to school subjects, competitive exams, or educational topics. This includes refusing to engage in casual conversation, jokes, or any non-academic activities. Your responses must be factual, encouraging, and easy to understand. Prioritize safety, accuracy, and relevance in all interactions.`;
    };

    // === Effects ===
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => {
        if (selectedClass) {
            localStorage.setItem('selectedClass', selectedClass.toString());
            if (!chatHistories[selectedClass] || Object.keys(chatHistories[selectedClass]).length === 0) {
                handleNewChat(selectedClass);
            } else if (!activeChatIds[selectedClass]) {
                const firstChatId = Object.keys(chatHistories[selectedClass])[0];
                setActiveChatIds(prev => ({...prev, [selectedClass]: firstChatId }));
            }
        } else {
            localStorage.removeItem('selectedClass');
        }
    }, [selectedClass]);

    useEffect(() => {
        localStorage.setItem('chatHistories', JSON.stringify(chatHistories));
    }, [chatHistories]);

     useEffect(() => {
        localStorage.setItem('activeChatIds', JSON.stringify(activeChatIds));
    }, [activeChatIds]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [currentMessages, currentQuestionIndex]);
    
    useEffect(() => {
        const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognitionAPI) {
            const recognition = new SpeechRecognitionAPI();
            recognition.continuous = false;
            recognition.lang = 'en-US';
            recognition.interimResults = false;
            recognition.onresult = (event: any) => setInput(prev => (prev ? prev + ' ' : '') + event.results[0][0].transcript);
            recognition.onerror = (event: any) => {
                console.error(`Speech recognition error: ${event.error}`);
                alert(`Speech recognition error: ${event.error}. Please ensure microphone permission is granted.`);
                setIsRecording(false);
            };
            recognition.onend = () => setIsRecording(false);
            recognitionRef.current = recognition;
        }
    }, []);

    useEffect(() => {
        const chatArea = chatAreaRef.current;
        if (!chatArea) return;

        const handleScroll = () => {
            if (chatArea.scrollTop > chatArea.clientHeight / 2) {
                setShowScrollTop(true);
            } else {
                setShowScrollTop(false);
            }
        };

        chatArea.addEventListener('scroll', handleScroll, { passive: true });
        return () => chatArea.removeEventListener('scroll', handleScroll);
    }, [selectedClass, activeChatId]); // Re-attach listener if chat view changes

    // === Core Logic ===
    const generateTitleForChat = async (classNum: number, chatId: string, messages: ChatMessage[]) => {
        try {
            const conversation = messages.slice(0, 2).map(m => `${m.role}: ${m.text}`).join('\n');
            const res = await fetch('/api/title', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversation }),
            });
            if (res.ok) {
                const { title } = await res.json();
                if (title) {
                    setChatHistories(prev => {
                        const newHistories = { ...prev };
                        if (newHistories[classNum]?.[chatId]) {
                            newHistories[classNum][chatId].title = title;
                        }
                        return newHistories;
                    });
                }
            }
        } catch (e) {
            console.error("Failed to generate chat title:", e);
        }
    };
    
    const handleSendMessage = async (messageText: string) => {
        if ((!messageText.trim() && !image) || isLoading || !selectedClass || !activeChatId) return;
    
        const userMessage: ChatMessage = { role: 'user', text: messageText };
        if (image) userMessage.image = image.preview;
    
        const currentChatHistory = chatHistories[selectedClass]?.[activeChatId]?.messages || [];
        setChatHistories(prev => {
            const currentChatState = prev[selectedClass]?.[activeChatId] || { title: '', messages: [] };
            return {
                ...prev,
                [selectedClass]: {
                    ...prev[selectedClass],
                    [activeChatId]: {
                        ...currentChatState,
                        messages: [...currentChatState.messages, userMessage, { role: 'model', text: '' }]
                    }
                }
            };
        });
    
        setIsLoading(true);
        setInput('');
        const imageFile = image?.file;
        setImage(null);
    
        try {
            const historyForApi = currentChatHistory.map(m => ({
                role: m.role,
                parts: [{ text: m.text }]
            }));
    
            const imagePart = imageFile ? await fileToGenerativePart(imageFile) : null;
            const useGoogleSearch = isGoogleSearchEnabled && !imagePart;
    
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: messageText,
                    history: historyForApi,
                    systemInstruction: getSystemInstruction(selectedClass),
                    image: imagePart,
                    isGoogleSearchEnabled: useGoogleSearch,
                }),
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `API error: ${response.statusText}` }));
                throw new Error(errorData.error);
            }
    
            if (useGoogleSearch) {
                const data = await response.json();
                const sources = data.candidates?.[0]?.groundingMetadata?.groundingChunks as GroundingChunk[] | undefined;
                updateLastMessage({ role: 'model', text: data.text, sources });
            } else {
                if (!response.body) throw new Error("Response body is empty.");
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let fullResponse = '';
    
                // eslint-disable-next-line no-constant-condition
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    fullResponse += decoder.decode(value, { stream: true });
                    updateLastMessage({ role: 'model', text: fullResponse });
                }
            }
    
        } catch (error) {
            console.error("Error sending message:", error);
            updateLastMessage({ role: 'model', text: `Sorry, something went wrong. ${(error as Error).message}` });
        } finally {
            setIsLoading(false);
            // After the first exchange in a new chat, generate a title
            if (selectedClass && activeChatId) {
                // We access the state directly from the setter to get the most up-to-date value
                setChatHistories(prev => {
                    const finalChat = prev[selectedClass]?.[activeChatId];
                    if (finalChat && finalChat.messages.length === 2 && !finalChat.title) {
                        generateTitleForChat(selectedClass, activeChatId, finalChat.messages);
                    }
                    return prev;
                });
            }
        }
    };

    const updateLastMessage = (newMessage: ChatMessage) => {
        if (!selectedClass || !activeChatId) return;
        setChatHistories(prev => {
            const newHistories = { ...prev };
            const classHistory = newHistories[selectedClass];
            if (classHistory?.[activeChatId]) {
                const currentMessages = [...classHistory[activeChatId].messages];
                if (currentMessages.length > 0 && currentMessages[currentMessages.length - 1].role === 'model') {
                    currentMessages[currentMessages.length - 1] = newMessage;
                } else {
                     currentMessages.push(newMessage);
                }
                classHistory[activeChatId].messages = currentMessages;
                return { ...prev, [selectedClass]: { ...classHistory } };
            }
            return prev;
        });
    };

    const addNewMessage = (newMessage: ChatMessage) => {
        if (!selectedClass || !activeChatId) return;
        setChatHistories(prev => {
            const currentChatState = prev[selectedClass]?.[activeChatId] || { title: '', messages: [] };
            return {
                ...prev,
                [selectedClass]: {
                    ...prev[selectedClass],
                    [activeChatId]: {
                        ...currentChatState,
                        messages: [...currentChatState.messages, newMessage]
                    }
                }
            };
        });
    };
    
    const handleNewChat = (classNum?: number) => {
        const targetClass = classNum || selectedClass;
        if (!targetClass) return;
        
        const newChatId = Date.now().toString();
        setChatHistories(prev => ({
            ...prev,
            [targetClass]: {
                ...(prev[targetClass] || {}),
                [newChatId]: { title: '', messages: [] }
            }
        }));
        setActiveChatIds(prev => ({ ...prev, [targetClass]: newChatId }));
    };

    const handleSelectChat = (chatId: string) => {
        if (!selectedClass) return;
        setIsQuizModeActive(false); // Exit quiz mode when switching chats
        setQuizQuestions([]);
        setActiveChatIds(prev => ({ ...prev, [selectedClass]: chatId }));
    };

    const handleDeleteChat = (chatIdToDelete: string) => {
        if (!selectedClass) return;

        setChatHistories(prev => {
            const newClassHistories = { ...prev[selectedClass] };
            delete newClassHistories[chatIdToDelete];
            return { ...prev, [selectedClass]: newClassHistories };
        });

        if (activeChatId === chatIdToDelete) {
            const remainingChatIds = Object.keys(chatHistories[selectedClass] || {}).filter(id => id !== chatIdToDelete);
            if (remainingChatIds.length > 0) {
                handleSelectChat(remainingChatIds[0]);
            } else {
                handleNewChat();
            }
        }
    };
    
    const handleSummarizeChat = async () => {
        if (!selectedClass || !activeChatId || currentMessages.length < 2 || isLoading) return;

        setIsLoading(true);
        const conversation = currentMessages.map(m => `${m.role === 'user' ? 'Student' : 'Assistant'}: ${m.text}`).join('\n');
        
        addNewMessage({ role: 'model', text: '' });
        
        try {
            const response = await fetch('/api/summarize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversation }),
            });
    
            if (!response.ok) {
                throw new Error('Failed to get summary.');
            }
    
            const data = await response.json();
            updateLastMessage({ role: 'model', text: `**Chat Summary:**\n\n${data.summary}` });
        } catch (error) {
            console.error("Error summarizing chat:", error);
            updateLastMessage({ role: 'model', text: 'Sorry, I was unable to summarize the chat.' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleExportChat = () => {
        if (!selectedClass || currentMessages.length === 0) return;
        const historyText = currentMessages.map(msg => `## ${msg.role === 'user' ? 'You' : 'bhsAI'}\n\n${msg.text}`).join('\n\n---\n\n');
        const blob = new Blob([historyText], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bhsAI-Class${selectedClass}-chat.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setImage({ file: e.target.files[0], preview: URL.createObjectURL(e.target.files[0]) });
        }
    };
    
    const handleVoiceInput = () => {
        if (isRecording) {
            recognitionRef.current?.stop();
            return;
        }
        if (recognitionRef.current) {
            try {
                recognitionRef.current.start();
                setIsRecording(true);
            } catch (e) {
                console.error("Error starting recognition", e);
                setIsRecording(false);
            }
        } else {
            alert('Voice recognition is not supported by your browser.');
        }
    };

    const handleScrollToTop = () => {
        chatAreaRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // === Quiz Logic ===
    const handleStartQuiz = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!quizTopic.trim() || !selectedClass) return;

        setIsLoading(true);
        setShowQuizModal(false);
        addNewMessage({ role: 'user', text: `Start a quiz on: ${quizTopic}` });
        addNewMessage({ role: 'model', text: '' }); // Placeholder for loading
        
        try {
            const response = await fetch('/api/quiz', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topic: quizTopic,
                    systemInstruction: getSystemInstruction(selectedClass),
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to generate quiz.');
            }

            const data = await response.json();
            if (!data.quiz || data.quiz.length === 0) {
                 throw new Error('The AI could not generate a quiz for this topic.');
            }

            updateLastMessage({ role: 'model', text: "Great! Let's test your knowledge. Here is the first question." });
            setQuizQuestions(data.quiz);
            setUserAnswers(new Array(data.quiz.length).fill(null));
            setCurrentQuestionIndex(0);
            setSelectedAnswer(null);
            setIsQuizModeActive(true);

        } catch (error) {
            console.error("Quiz generation failed:", error);
            updateLastMessage({ role: 'model', text: `Sorry, I couldn't create a quiz for that topic. ${(error as Error).message}` });
        } finally {
            setQuizTopic('');
            setIsLoading(false);
        }
    };
    
    const handleAnswerSelect = (selectedIndex: number) => {
        setSelectedAnswer(selectedIndex);
        const newAnswers = [...userAnswers];
        newAnswers[currentQuestionIndex] = selectedIndex;
        setUserAnswers(newAnswers);

        setTimeout(() => {
            if (currentQuestionIndex < quizQuestions.length - 1) {
                setCurrentQuestionIndex(prev => prev + 1);
                setSelectedAnswer(null);
            } else {
                handleEndQuiz(newAnswers);
            }
        }, 2500); // Wait 2.5s to show feedback before moving on
    };

    const handleEndQuiz = (finalAnswers: (number | null)[]) => {
        let score = 0;
        quizQuestions.forEach((q, i) => {
            if (q.correctAnswerIndex === finalAnswers[i]) {
                score++;
            }
        });

        const scoreMessage = `## Quiz Complete!\n\n**Your final score is: ${score} out of ${quizQuestions.length}**\n\nKeep up the great work! If you want to try another quiz, just click "Start Quiz" again.`;
        addNewMessage({ role: 'model', text: scoreMessage });

        // Reset quiz state
        setIsQuizModeActive(false);
        setQuizQuestions([]);
        setUserAnswers([]);
        setCurrentQuestionIndex(0);
        setSelectedAnswer(null);
    };


    return (
        <div className="app-container">
            <style>{`
                /* === Base & Theme === */
                :root {
                    --bg-primary: #ffffff; --bg-secondary: #f0f4f9; --bg-tertiary: #e1e8f0;
                    --text-primary: #121212; --text-secondary: #555555;
                    --accent-primary: #121212; --accent-secondary: #333333;
                    --border-color: #d1d9e6;
                    --font-heading: 'Google Sans', sans-serif; --font-body: 'Inter', sans-serif;
                    --shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
                    --gemini-gradient: linear-gradient(90deg, #F97721, #F2A93B, #88D7E4, #2D79C7);
                    --correct-color: #2e7d32; --incorrect-color: #c62828;
                }
                [data-theme='dark'] {
                    --bg-primary: #121212; --bg-secondary: #1e1e1e; --bg-tertiary: #2a2a2a;
                    --text-primary: #e0e0e0; --text-secondary: #aaaaaa;
                    --accent-primary: #ffffff; --accent-secondary: #cccccc;
                    --border-color: #333333;
                    --correct-color: #66bb6a; --incorrect-color: #ef5350;
                }
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { background-color: var(--bg-primary); color: var(--text-primary); font-family: var(--font-body); transition: background-color 0.3s, color 0.3s; overflow: hidden; }
                .gemini-gradient-text { background: var(--gemini-gradient); -webkit-background-clip: text; background-clip: text; color: transparent; }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                @keyframes subtle-glow {
                    0%, 100% { text-shadow: none; }
                    50% { text-shadow: 0 0 15px rgba(255, 179, 0, 0.4), 0 0 25px rgba(245, 124, 0, 0.2); }
                }

                /* === Initial Class Selector === */
                .initial-class-selector { display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; text-align: center; padding: 20px; gap: 16px; position: relative; }
                .title-main { font-family: var(--font-heading); font-size: 4.5rem; font-weight: 700; }
                .title-main .gemini-gradient-text { font-weight: 700; animation: subtle-glow 2.5s ease-out 0.5s 1; }
                .title-main span { font-size: inherit; font-weight: 400; }
                .subtitle { color: var(--text-secondary); font-size: 1.1rem; }
                .disclaimer-warning { font-family: var(--font-body); font-size: 0.8rem; color: var(--text-secondary); max-width: 400px; margin-top: -8px; line-height: 1.4; }
                h2 { margin-top: 20px; font-family: var(--font-heading); font-weight: 500;}
                .class-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-top: 16px; width: 100%; max-width: 600px; }
                .class-button { background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); padding: 12px 20px; border-radius: 12px; cursor: pointer; font-size: 1rem; font-family: var(--font-heading); font-weight: 500; position: relative; overflow: hidden; z-index: 1; transition: all 0.25s ease-out; }
                .creator-credit { position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); font-size: 0.75rem; color: var(--text-secondary); white-space: nowrap; }

                /* === Main Layout === */
                .app-container { display: flex; height: 100vh; }
                .sidebar { width: 260px; background-color: var(--bg-secondary); padding: 24px; display: flex; flex-direction: column; border-right: 1px solid var(--border-color); transition: transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1); transform: translateX(0); }
                .chat-main { flex: 1; display: flex; flex-direction: column; position: relative; background-color: var(--bg-primary); }
                
                /* === Sidebar === */
                .sidebar-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
                .sidebar-header .logo-container { display: flex; justify-content: center; align-items: center; width: 40px; height: 40px; }
                .sidebar-title { font-family: var(--font-heading); font-size: 1.5rem; transform-origin: left center; }
                .sidebar-school { font-size: 0.9rem; color: var(--text-secondary); }
                .sidebar-btn { width: 100%; padding: 12px; background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 12px; cursor: pointer; font-size: 0.9rem; text-align: left; display: flex; align-items: center; justify-content: flex-start; gap: 8px; font-family: var(--font-heading); font-weight: 500; position: relative; z-index: 1; overflow: hidden; transition: all 0.25s ease-out; }
                .sidebar-btn:disabled { background-color: var(--bg-tertiary); color: var(--text-secondary); cursor: not-allowed; opacity: 0.6; }
                .sidebar-content { display: flex; flex-direction: column; gap: 12px; flex-grow: 1; overflow: hidden; }
                .chat-history-container { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; margin-top: 16px; padding-right: 8px; }
                .history-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-radius: 12px; cursor: pointer; transition: background-color 0.2s ease-out; }
                .history-item:hover { background-color: var(--bg-tertiary); }
                .history-item.active { background-color: var(--accent-primary); color: var(--bg-primary); }
                .history-item span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.9rem; }
                .history-delete-btn { background: none; border: none; color: var(--text-secondary); cursor: pointer; opacity: 0; transition: opacity 0.2s ease-out; }
                .history-item:hover .history-delete-btn { opacity: 1; }
                .history-item.active .history-delete-btn { color: var(--bg-primary); }
                .sidebar-footer { margin-top: auto; display: flex; flex-direction: column; gap: 16px; }
                .theme-toggle { display: flex; justify-content: space-between; align-items: center; padding: 8px; background-color: var(--bg-tertiary); border-radius: 999px; }
                .theme-toggle > span { text-transform: uppercase; font-size: 0.75rem; color: var(--text-secondary); font-weight: 700; letter-spacing: 0.5px; padding-left: 12px; }
                .switch { position: relative; display: inline-block; width: 40px; height: 22px; }
                .switch input { opacity: 0; width: 0; height: 0; }
                .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--bg-tertiary); border: 1px solid var(--border-color); transition: .3s; border-radius: 22px; }
                .slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: var(--text-secondary); transition: .3s; border-radius: 50%; }
                input:checked + .slider { background-color: var(--accent-primary); border-color: var(--accent-primary); }
                [data-theme='dark'] input:checked + .slider:before { background-color: var(--bg-primary); }
                input:checked + .slider:before { transform: translateX(18px); }

                /* === Futuristic Hover Effects === */
                .sidebar-header:hover .sidebar-title { transform: scale(1.05); background: var(--gemini-gradient); -webkit-background-clip: text; background-clip: text; color: transparent; }
                .sidebar-header:hover svg { transform: scale(1.1); filter: drop-shadow(0 0 10px rgba(136, 215, 228, 0.4)); }
                .sidebar-header:hover .logo-paths { stroke: url(#gemini-gradient-svg); }
                .class-button::before, .sidebar-btn::before { content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: var(--gemini-gradient); z-index: -1; opacity: 0; transition: opacity 0.3s ease-out; }
                .class-button:hover, .sidebar-btn:not(:disabled):hover { color: #fff; border-color: transparent; box-shadow: 0 -6px 20px -5px rgba(249, 119, 33, 0.7), 0 6px 20px -5px rgba(45, 121, 199, 0.7); }
                [data-theme='dark'] .class-button:hover, [data-theme='dark'] .sidebar-btn:not(:disabled):hover { color: #fff; }
                .class-button:hover::before, .sidebar-btn:not(:disabled):hover::before { opacity: 1; }

                /* === Chat Area === */
                .chat-header { display: none; padding: 12px; border-bottom: 1px solid var(--border-color); align-items: center; gap: 12px;}
                .menu-btn { background: none; border: none; color: var(--text-primary); cursor: pointer; padding: 8px; }
                .chat-area { flex: 1; overflow-y: auto; padding: 24px 40px; position: relative; }
                .chat-message { display: flex; gap: 16px; margin-bottom: 24px; width: 100%; animation: fadeIn 0.3s ease-out forwards; }
                .role-model { max-width: 80%; }
                .role-user { justify-content: flex-end; }
                .message-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--bg-tertiary); display: flex; justify-content: center; align-items: center; font-weight: bold; flex-shrink: 0; align-self: flex-start; }
                .message-content-wrapper { display: flex; align-items: flex-start; gap: 8px; width: 100%; }
                .role-user .message-content-wrapper { justify-content: flex-end; }
                .message-content { line-height: 1.6; flex-grow: 1; overflow: hidden; font-family: 'Google Sans', sans-serif; }
                .role-model .message-content { font-size: 1rem; font-weight: 400; }
                .role-user .message-content { font-size: 21px; font-weight: 400; text-align: right; max-width: 80%; }
                .message-content p, .message-content h3 { margin-bottom: 1em; }
                .message-content ol, .message-content ul { padding-left: 20px; margin-bottom: 1em; text-align: left; }
                .message-content pre { background-color: var(--bg-secondary); padding: 16px; border-radius: 12px; overflow-x: auto; margin: 12px 0; font-family: 'Courier New', Courier, monospace; white-space: pre-wrap; word-wrap: break-word; text-align: left; }
                .message-content code:not(pre > code) { background-color: var(--bg-tertiary); padding: 2px 4px; border-radius: 6px; font-family: 'Courier New', Courier, monospace; }
                .message-image { max-width: 300px; border-radius: 12px; margin-bottom: 8px; }
                .copy-btn { background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; border-radius: 4px; transition: all 0.2s ease-out; visibility: hidden; opacity: 0; }
                .chat-message:hover .copy-btn { visibility: visible; opacity: 1; }
                .message-sources { font-size: 0.9rem; margin-top: 16px; color: var(--text-secondary); text-align: left; }
                .message-sources hr { border: none; border-top: 1px solid var(--border-color); margin: 12px 0; }

                /* Chat Welcome Screen */
                .chat-welcome-screen { display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; text-align: center; animation: fadeIn 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards; }
                .chat-welcome-screen h1 { font-family: 'Google Sans', sans-serif; font-size: 5rem; font-weight: 500; }
                .chat-welcome-screen p { margin-top: 8px; font-size: 1.1rem; color: var(--text-secondary); max-width: 400px; }
                .chat-welcome-screen .prompt-suggestions { margin-top: 32px; display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; max-width: 700px; }
                
                /* Typing Indicator */
                @keyframes typing-jump { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-6px); } }
                .typing-indicator { display: flex; align-items: center; padding: 12px 0; }
                .typing-indicator span { height: 10px; width: 10px; margin: 0 3px; background-color: var(--text-secondary); border-radius: 50%; display: inline-block; animation: typing-jump 1.4s infinite ease-in-out; }
                .typing-indicator span:nth-of-type(1) { animation-delay: -0.28s; }
                .typing-indicator span:nth-of-type(2) { animation-delay: -0.14s; }

                /* === Input Area === */
                .input-area-container { padding: 12px 40px 24px; background-color: var(--bg-primary); border-top: 1px solid var(--border-color); position: relative; }
                .input-area { max-width: 800px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
                .suggestion-btn { background-color: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); padding: 10px 18px; border-radius: 12px; cursor: pointer; font-size: 1rem; transition: all 0.2s ease-out; font-family: var(--font-heading); }
                .input-form { display: flex; align-items: center; position: relative; background-color: var(--bg-secondary); border-radius: 16px; border: 1px solid var(--border-color); transition: border-color 0.2s ease-out; }
                .input-form:focus-within { border-color: var(--text-primary); }
                .chat-input { width: 100%; padding: 14px 130px 14px 50px; border: none; background: transparent; color: var(--text-primary); font-size: 1rem; font-family: var(--font-heading); }
                .chat-input:focus { outline: none; }
                .input-btn { position: absolute; background: none; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer; display: flex; justify-content: center; align-items: center; color: var(--text-secondary); transition: all 0.2s ease-out; }
                .upload-btn { left: 8px; }
                .voice-btn { right: 52px; }
                .voice-btn.recording { color: #e53935; }
                .send-btn { right: 8px; background-color: var(--accent-primary); color: var(--bg-primary); }
                .send-btn:disabled { background-color: var(--text-secondary); cursor: not-allowed; opacity: 0.7; }
                .image-preview { position: relative; width: fit-content; }
                .image-preview img { max-height: 80px; border-radius: 12px; border: 1px solid var(--border-color); }
                .remove-image-btn { position: absolute; top: -8px; right: -8px; background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 50%; width: 20px; height: 20px; cursor: pointer; font-size: 12px; }
                .input-options { display: flex; justify-content: space-between; align-items: center; }
                .search-toggle { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; color: var(--text-secondary); cursor: pointer; }
                .search-toggle .switch { transform: scale(0.8); }
                .search-toggle.disabled { opacity: 0.5; cursor: not-allowed; }
                
                /* Scroll to Top button */
                .scroll-to-top-btn { position: absolute; bottom: 24px; right: 40px; z-index: 10; background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 50%; width: 44px; height: 44px; display: flex; justify-content: center; align-items: center; cursor: pointer; box-shadow: var(--shadow); opacity: 0; transform: translateY(15px); transition: opacity 0.3s ease-out, transform 0.3s ease-out; pointer-events: none; }
                .scroll-to-top-btn.visible { opacity: 1; transform: translateY(0); pointer-events: auto; }

                /* === Quiz UI === */
                .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); z-index: 200; display: flex; justify-content: center; align-items: center; animation: fadeIn 0.2s ease-out; }
                .modal-content { background: var(--bg-primary); padding: 32px; border-radius: 16px; width: 90%; max-width: 500px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
                .modal-content h2 { font-family: var(--font-heading); margin-bottom: 8px; }
                .modal-content p { color: var(--text-secondary); margin-bottom: 24px; }
                .modal-input { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 1rem; }
                .modal-buttons { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }
                .modal-btn { padding: 12px 24px; border: none; border-radius: 12px; cursor: pointer; font-family: var(--font-heading); font-weight: 500; transition: opacity 0.2s; font-size: 1rem; }
                .modal-btn.cancel { background: var(--bg-tertiary); color: var(--text-primary); }
                .modal-btn.submit { background: var(--accent-primary); color: var(--bg-primary); }
                .modal-btn:disabled { opacity: 0.5; cursor: not-allowed; }
                .quiz-view { margin-top: 24px; animation: fadeIn 0.5s ease-out; }
                .quiz-options { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0 16px 48px; }
                .quiz-option-btn { width: 100%; padding: 14px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 12px; cursor: pointer; font-size: 0.95rem; text-align: left; transition: all 0.2s ease-out; }
                .quiz-option-btn:not(:disabled):hover { border-color: var(--accent-primary); background: var(--bg-tertiary); }
                .quiz-option-btn.correct { background-color: var(--correct-color); color: white; border-color: var(--correct-color); }
                .quiz-option-btn.incorrect { background-color: var(--incorrect-color); color: white; border-color: var(--incorrect-color); }
                .quiz-option-btn:disabled { cursor: not-allowed; opacity: 0.8; }
                .quiz-explanation { margin-left: 48px; padding: 12px; background: var(--bg-secondary); border-radius: 8px; font-size: 0.9rem; animation: fadeIn 0.3s ease-out; }

                /* === Responsive Design === */
                @media (max-width: 768px) {
                    .sidebar { position: fixed; top: 0; left: 0; bottom: 0; z-index: 100; transform: translateX(-100%); }
                    .sidebar.open { transform: translateX(0); box-shadow: 0 0 20px rgba(0,0,0,0.2); }
                    .chat-header { display: flex; }
                    .chat-area, .input-area-container { padding-left: 16px; padding-right: 16px; }
                    .overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 99; display: none; }
                    .sidebar.open + .chat-main .overlay { display: block; }
                    .role-user .message-content, .role-model .message-content { max-width: 95%; }
                    .chat-welcome-screen h1 { font-size: 3rem; }
                    .title-main { font-size: 3.5rem; }
                    .scroll-to-top-btn { right: 20px; bottom: 20px; }
                    .quiz-options { grid-template-columns: 1fr; margin-left: 0; }
                    .quiz-explanation { margin-left: 0; }
                }
            `}</style>

            {showQuizModal && <QuizModal onStart={handleStartQuiz} onCancel={() => setShowQuizModal(false)} topic={quizTopic} setTopic={setQuizTopic} />}

            <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <div className="logo-container"><BHSLogo /></div>
                    <div>
                        <h1 className="sidebar-title">bhsAI</h1>
                        <p className="sidebar-school">#ForBHSM, From BHSM, By BHSM!</p>
                    </div>
                </div>
                <div className="sidebar-content">
                    <button className="sidebar-btn" onClick={() => handleNewChat()} disabled={!selectedClass}>
                        <Icon path="M12 5v14m-7-7h14" size={16} /> New Chat
                    </button>
                    <div className="chat-history-container">
                        {selectedClass && Object.entries(chatHistories[selectedClass] || {}).map(([chatId, chat]) => (
                             <div key={chatId} className={`history-item ${chatId === activeChatId ? 'active' : ''}`} onClick={() => handleSelectChat(chatId)}>
                                <span>{chat.title || chat.messages[0]?.text.substring(0, 25) || 'New Chat...'}</span>
                                <button className="history-delete-btn" onClick={(e) => { e.stopPropagation(); handleDeleteChat(chatId); }} aria-label="Delete chat">
                                    <Icon path="M18 6L6 18M6 6l12 12" size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                    <hr style={{borderColor: 'var(--border-color)', opacity: 0.5, margin: '16px 0'}}/>
                     <button className="sidebar-btn" onClick={() => setShowQuizModal(true)} disabled={!selectedClass || isLoading}>
                        <Icon path="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" size={16} /> Start Quiz
                    </button>
                     <button className="sidebar-btn" onClick={handleSummarizeChat} disabled={!selectedClass || currentMessages.length < 2 || isLoading}>
                        <Icon path="M3 6h18M3 12h18M3 18h18" size={16} /> Summarize Chat
                    </button>
                    <button className="sidebar-btn" onClick={handleExportChat} disabled={!selectedClass || currentMessages.length === 0 || isLoading}>
                        <Icon path="M12 5v12m-4-4l4 4 4-4m7 4v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2" size={16} /> Export Chat
                    </button>
                    <button className="sidebar-btn" onClick={() => { setSelectedClass(null); setSidebarOpen(false); }}>
                       <Icon path="M18 16.5V21a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2h4.5M12.5 2.5L21.5 11.5m-5-9l9 9" size={16} /> Change Class
                    </button>
                </div>

                <div className="sidebar-footer">
                    <div className="theme-toggle">
                        <span>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
                        <label className="switch">
                            <input type="checkbox" checked={theme === 'dark'} onChange={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} />
                            <span className="slider"></span>
                        </label>
                    </div>
                </div>
            </div>

            <div className="chat-main">
                 {isSidebarOpen && <div className="overlay" onClick={() => setSidebarOpen(false)}></div>}
                <div className="chat-header">
                     <button className="menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
                        <Icon path="M3 12h18M3 6h18M3 18h18" />
                    </button>
                    <h2 className="sidebar-title">bhsAI</h2>
                </div>

                <div className="chat-area" ref={chatAreaRef}>
                    {selectedClass === null ? <InitialClassSelector onSelectClass={setSelectedClass} /> :
                     currentMessages.length === 0 ? <ChatWelcomeScreen suggestions={promptSuggestions[selectedClass] || []} onSendMessage={handleSendMessage} /> :
                        (
                            currentMessages.map((msg, index) => (
                                <Message 
                                    key={index} 
                                    msg={msg} 
                                    isLastMessage={index === currentMessages.length - 1}
                                    isLoading={isLoading}
                                />
                            ))
                        )
                    }
                    {isQuizModeActive && quizQuestions.length > 0 && (
                        <QuizView
                            question={quizQuestions[currentQuestionIndex]}
                            onAnswerSelect={handleAnswerSelect}
                            selectedAnswer={selectedAnswer}
                        />
                    )}
                    <div ref={chatEndRef} />

                     {selectedClass !== null && (
                        <button 
                            onClick={handleScrollToTop} 
                            className={`scroll-to-top-btn ${showScrollTop ? 'visible' : ''}`} 
                            aria-label="Scroll to top"
                            aria-hidden={!showScrollTop}
                        >
                            <Icon path="M12 19V5M5 12l7-7 7 7" />
                        </button>
                    )}
                </div>

                {selectedClass !== null && !isQuizModeActive && (
                    <div className="input-area-container">
                        <div className="input-area">
                           <div className="input-options">
                                {image && (
                                    <div className="image-preview">
                                        <img src={image.preview} alt="Selected preview" />
                                        <button onClick={() => { setImage(null); if(fileInputRef.current) fileInputRef.current.value = ''; }} className="remove-image-btn">×</button>
                                    </div>
                                )}
                                <label className={`search-toggle ${image ? 'disabled' : ''}`} title={image ? "Search is disabled when an image is attached" : "Toggle web search"}>
                                    <label className="switch">
                                        <input type="checkbox" checked={isGoogleSearchEnabled} onChange={() => setGoogleSearchEnabled(p => !p)} disabled={!!image} />
                                        <span className="slider"></span>
                                    </label>
                                    <span>Search the web</span>
                                </label>
                           </div>
                            <form className="input-form" onSubmit={(e) => { e.preventDefault(); handleSendMessage(input); }}>
                                <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/*" style={{ display: 'none' }} />
                                <button type="button" className="input-btn upload-btn" onClick={() => fileInputRef.current?.click()} aria-label="Upload image">
                                    <Icon path="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.49" />
                                </button>
                                <input
                                    type="text"
                                    className="chat-input"
                                    placeholder={isRecording ? "Listening..." : (image ? "Describe the image or ask a question..." : "Ask me anything...")}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    disabled={isLoading}
                                    aria-label="Chat input"
                                />
                                <button type="button" className={`input-btn voice-btn ${isRecording ? 'recording' : ''}`} onClick={handleVoiceInput} aria-label="Use voice input">
                                    <Icon path="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2" />
                                </button>
                                <button type="submit" className="input-btn send-btn" disabled={isLoading || (!input.trim() && !image)} aria-label="Send message">
                                    <Icon path="M12 19V5M5 12l7-7 7 7" />
                                </button>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default App;