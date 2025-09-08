









import React, { useState, useEffect, useRef, useMemo } from 'react';
import { marked, Renderer } from 'marked';
import { initDB, migrateFromLocalStorage, getChatsForClass, addChat, updateChat, deleteChat } from './utils/db';
import type { ChatMessage, QuizQuestion, SelectOption, StoredChat } from './types';


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

// === Enhanced Markdown Rendering for Code Blocks ===
const renderer = new Renderer();
const originalCodeRenderer = renderer.code;
const copyIconPath = "M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2";
const checkIconPath = "M20 6L9 17l-5-5";

renderer.code = function({ text: code, lang: infostring, escaped }) {
    const originalHtml = originalCodeRenderer.call(this, { text: code, lang: infostring, escaped });
    const safeCode = code.replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const copySVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="${copyIconPath}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    const buttonHtml = `
      <button 
        class="copy-code-btn" 
        data-code="${safeCode}"
        aria-label="Copy code"
      >
        ${copySVG}
        <span>Copy</span>
      </button>
    `;
    return `<div class="code-block-wrapper">${originalHtml}${buttonHtml}</div>`;
};
marked.use({ renderer });


// === Reusable UI Components (Moved outside App for performance) ===

const GlobalSvgDefs = () => (
    <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
            <linearGradient id="gemini-gradient-svg" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#F97721" />
                <stop offset="25%" stopColor="#F2A93B" />
                <stop offset="75%" stopColor="#88D7E4" />
                <stop offset="100%" stopColor="#2D79C7" />
            </linearGradient>
        </defs>
    </svg>
);


const BHSLogo = ({ className, size = 32 }: { className?: string, size?: number }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ strokeWidth: 1.5 }}>
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

const SkeletonLoader = () => (
    <div className="skeleton-loader">
        <div className="skeleton-line" style={{ width: '85%' }} />
        <div className="skeleton-line" style={{ width: '95%' }} />
        <div className="skeleton-line" style={{ width: '70%' }} />
    </div>
);


const Message = React.memo(({ msg, msgIndex, isLastMessage, isLoading }: { msg: ChatMessage; msgIndex: number; isLastMessage: boolean; isLoading: boolean }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(msg.text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const showTyping = isLoading && isLastMessage && msg.role === 'model';
    
    const htmlContent = useMemo(() => {
        let processedText = msg.text;
        if (msg.sources && msg.sources.length > 0 && /\[\d+\]/.test(processedText)) {
            processedText = processedText.replace(/\[(\d+)\]/g, (match, numberStr) => {
                const index = parseInt(numberStr, 10) - 1;
                if (msg.sources && index >= 0 && index < msg.sources.length) {
                    return `<sup><a href="#source-${msgIndex}-${index}" class="source-link" title="${msg.sources[index].web.title}">${numberStr}</a></sup>`;
                }
                return match;
            });
        }
        return marked.parse(processedText) as string;
    }, [msg.text, msg.sources, msgIndex]);

    return (
        <div className={`chat-message role-${msg.role}`}>
            {msg.role === 'model' && <div className="message-avatar"><BHSLogo size={32} /></div>}
            <div className="message-content-wrapper">
                <div className="message-content">
                    {msg.image && <img src={msg.image} alt="User upload" className="message-image" />}
                    
                    {msg.text && <div dangerouslySetInnerHTML={{ __html: htmlContent }}></div>}
                    
                    {showTyping && <SkeletonLoader />}

                     {msg.sources && msg.sources.length > 0 && (
                        <div className="message-sources">
                            <hr />
                            <p><strong>Sources from the web:</strong></p>
                            <ol>{msg.sources.map((source, i) => (<li key={i} id={`source-${msgIndex}-${i}`}><a href={source.web.uri} target="_blank" rel="noopener noreferrer">{source.web.title || new URL(source.web.uri).hostname}</a></li>))}</ol>
                        </div>
                    )}
                </div>
                {msg.role === 'model' && msg.text && !showTyping && (
                     <button onClick={handleCopy} className="copy-btn" aria-label="Copy entire message">
                         {copied ? <Icon path={checkIconPath} size={16} /> : <Icon path={copyIconPath} size={16} />}
                     </button>
                )}
            </div>
        </div>
    );
});
Message.displayName = 'Message'; 

const InitialClassSelector = ({ onSelectClass }: { onSelectClass: (grade: number) => void }) => (
    <div className="initial-class-selector">
        <BHSLogo size={80} />
        <h1 className="title-main"><span>Welcome to </span><span className="gemini-gradient-text">Questionnaire</span></h1>
        <p className="subtitle">Smarter than your homework excuses!</p>
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

const CustomSelect = ({ options, value, onChange, label, id }: {
    options: SelectOption[];
    value: string | number;
    onChange: (value: string | number) => void;
    label: string;
    id: string;
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    const selectedOption = options.find(opt => opt.value === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);

    useEffect(() => {
        if (isOpen && activeIndex >= 0 && listRef.current) {
            const activeItem = listRef.current.children[activeIndex] as HTMLLIElement;
            if (activeItem) {
                activeItem.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [isOpen, activeIndex]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            setIsOpen(false);
            buttonRef.current?.focus();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setIsOpen(true);
            setActiveIndex(prev => (prev + 1) % options.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setIsOpen(true);
            setActiveIndex(prev => (prev - 1 + options.length) % options.length);
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (isOpen) {
                if (activeIndex >= 0) {
                    onChange(options[activeIndex].value);
                }
                setIsOpen(false);
                buttonRef.current?.focus();
            } else {
                setIsOpen(true);
            }
        } else if (e.key === 'Home') {
            e.preventDefault();
            setIsOpen(true);
            setActiveIndex(0);
        } else if (e.key === 'End') {
            e.preventDefault();
            setIsOpen(true);
            setActiveIndex(options.length - 1);
        }
    };

    const handleOptionClick = (optionValue: string | number) => {
        onChange(optionValue);
        setIsOpen(false);
        buttonRef.current?.focus();
    };

    return (
        <div className="modal-form-group">
            <label id={`${id}-label`} className="custom-select-label">{label}</label>
            <div className="custom-select-wrapper" ref={wrapperRef}>
                <button
                    ref={buttonRef}
                    id={id}
                    type="button"
                    className="custom-select-button"
                    onClick={() => setIsOpen(!isOpen)}
                    onKeyDown={handleKeyDown}
                    aria-haspopup="listbox"
                    aria-expanded={isOpen}
                    aria-labelledby={`${id}-label ${id}`}
                >
                    <span>{selectedOption ? selectedOption.label : 'Select...'}</span>
                    <Icon path="m6 9 6 6 6-6" />
                </button>
                {isOpen && (
                    <ul
                        ref={listRef}
                        className="custom-select-options"
                        role="listbox"
                        aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
                        tabIndex={-1}
                    >
                        {options.map((option, index) => (
                            <li
                                key={option.value}
                                id={`${id}-option-${index}`}
                                role="option"
                                aria-selected={value === option.value}
                                className={`custom-select-option ${index === activeIndex ? 'active' : ''}`}
                                onClick={() => handleOptionClick(option.value)}
                                onMouseEnter={() => setActiveIndex(index)}
                            >
                                {option.label}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};


const QuizModal = ({ 
    onStart, onCancel, topic, setTopic, numQuestions, setNumQuestions, difficulty, setDifficulty 
}: { 
    onStart: (e: React.FormEvent) => void, 
    onCancel: () => void, 
    topic: string, 
    setTopic: (t: string) => void, 
    numQuestions: number, 
    setNumQuestions: React.Dispatch<React.SetStateAction<number>>,
    difficulty: string,
    setDifficulty: React.Dispatch<React.SetStateAction<string>>
}) => {
    
    const quizNumOptions: SelectOption[] = [
        { value: 5, label: '5 Questions' },
        { value: 10, label: '10 Questions' },
        { value: 15, label: '15 Questions' },
        { value: 20, label: '20 Questions' },
    ];

    const quizDifficultyOptions: SelectOption[] = [
        { value: 'Easy', label: 'Easy' },
        { value: 'Medium', label: 'Medium' },
        { value: 'Hard', label: 'Hard' },
    ];

    return (
        <div className="modal-overlay">
            <div className="modal-content quiz-setup-modal">
                <div className="modal-header">
                    <BHSLogo className="modal-header-icon" />
                    <h3>Quiz <span className="gemini-gradient-text">Setup</span></h3>
                </div>
                 <p className="modal-subtitle">Enter a topic and select your quiz options below.</p>
                <form onSubmit={onStart}>
                     <div className="modal-form-group">
                        <label htmlFor="quiz-topic">Topic</label>
                        <div className="modal-input-wrapper">
                            <Icon path="M9.5 3A6.5 6.5 0 0116 9.5c0 1.61-.59 3.09-1.56 4.23l.27.27h.79l5 5-1.5 1.5-5-5v-.79l-.27-.27A6.516 6.516 0 019.5 16a6.5 6.5 0 110-13m0 2C7 5 5 7 5 9.5S7 14 9.5 14 14 12 14 9.5 12 5 9.5 5z" size={20} />
                            <input
                                id="quiz-topic"
                                type="text"
                                className="modal-input"
                                value={topic}
                                onChange={(e) => setTopic(e.target.value)}
                                placeholder="e.g., Newton's Laws of Motion"
                                aria-label="Quiz topic"
                                autoFocus
                            />
                        </div>
                    </div>
                    
                    <CustomSelect
                        id="difficulty-level"
                        label="Difficulty"
                        options={quizDifficultyOptions}
                        value={difficulty}
                        onChange={(value) => setDifficulty(value as string)}
                    />

                    <CustomSelect
                        id="num-questions"
                        label="Number of Questions"
                        options={quizNumOptions}
                        value={numQuestions}
                        onChange={(value) => setNumQuestions(value as number)}
                    />

                    <div className="modal-buttons">
                        <button type="button" className="modal-btn cancel" onClick={onCancel}>Cancel</button>
                        <button type="submit" className="modal-btn submit" disabled={!topic.trim()}>Start Quiz</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

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

const QuizProgressBar = ({ current, total }: { current: number; total: number }) => (
    <div className="quiz-progress-bar">
        <div className="progress-text">Question {current} of {total}</div>
        <div className="progress-track">
            <div className="progress-fill" style={{ width: `${(current / total) * 100}%` }}></div>
        </div>
    </div>
);

const QuizResults = ({ score, total, onTryAgain, onFinish, questions, userAnswers }: { 
    score: number; 
    total: number; 
    onTryAgain: () => void; 
    onFinish: () => void;
    questions: QuizQuestion[];
    userAnswers: (number | null)[];
}) => {
    const [displayScore, setDisplayScore] = useState(0);
    const percentage = total > 0 ? (score / total) * 100 : 0;
    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;

    useEffect(() => {
        if (score === 0) return;
        let start = 0;
        const end = score;
        const duration = 800;
        const incrementTime = Math.max(1, Math.floor(duration / end));

        const timer = setInterval(() => {
            start += 1;
            if (start >= end) {
                setDisplayScore(end);
                clearInterval(timer);
            } else {
                setDisplayScore(start);
            }
        }, incrementTime);

        return () => clearInterval(timer);
    }, [score]);

    const incorrectAnswers = questions.map((q, i) => ({
        question: q,
        userAnswerIndex: userAnswers[i],
        index: i
    })).filter(item => item.userAnswerIndex !== item.question.correctAnswerIndex);

    return (
        <div className="quiz-results-view">
            <h2 className="results-title">Quiz Complete!</h2>
            <div className="score-chart">
                <svg width="120" height="120" viewBox="0 0 120 120">
                    <defs>
                        <linearGradient id="gemini-gradient-quiz" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#F97721" />
                            <stop offset="25%" stopColor="#F2A93B" />
                            <stop offset="75%" stopColor="#88D7E4" />
                            <stop offset="100%" stopColor="#2D79C7" />
                        </linearGradient>
                    </defs>
                    <circle className="score-chart-track" cx="60" cy="60" r={radius} />
                    <circle
                        className="score-chart-progress"
                        cx="60"
                        cy="60"
                        r={radius}
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        style={{ stroke: 'url(#gemini-gradient-quiz)' }}
                    />
                </svg>
                <div className="score-text">
                    <strong>{displayScore}</strong>
                    <span>/ {total}</span>
                </div>
            </div>
            <p className="score-summary">You answered {score} out of {total} questions correctly.</p>

            {incorrectAnswers.length > 0 && (
                <div className="performance-report">
                    <h3>Performance Report</h3>
                    <p className="report-intro">Here are the questions you missed:</p>
                    {incorrectAnswers.map(item => (
                        <div key={item.index} className="report-item">
                            <div className="report-question" dangerouslySetInnerHTML={{ __html: marked.parse(item.question.question) as string }} />
                            <p className="report-answer your-answer">
                                <strong>Your Answer:</strong> {item.userAnswerIndex !== null ? item.question.options[item.userAnswerIndex] : 'Not answered'}
                            </p>
                            <p className="report-answer correct-answer">
                                <strong>Correct Answer:</strong> {item.question.options[item.question.correctAnswerIndex]}
                            </p>
                        </div>
                    ))}
                </div>
            )}

            <div className="results-actions">
                <button className="results-btn finish" onClick={onFinish}>Back to Chat</button>
                <button className="results-btn try-again" onClick={onTryAgain}>Try Another Quiz</button>
            </div>
        </div>
    );
};

const DesktopOnlyView = () => (
    <div className="desktop-only-container">
        <BHSLogo size={80} />
        <h1 className="title-main gemini-gradient-text" style={{ fontSize: '3rem' }}>Questionnaire</h1>
        <p className="subtitle">This application is best viewed on a desktop or laptop.</p>
        <p className="disclaimer-warning" style={{ fontSize: '1rem', marginTop: '8px' }}>Please switch to a larger screen to continue.</p>
    </div>
);


const App = () => {
    // === State Management ===
    const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
    const [selectedClass, setSelectedClass] = useState<number | null>(() => {
        const savedClass = localStorage.getItem('selectedClass');
        return savedClass ? parseInt(savedClass, 10) : null;
    });
    
    // DB & Chat State
    const [dbReady, setDbReady] = useState(false);
    const [chatsForClass, setChatsForClass] = useState<StoredChat[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);

    const [input, setInput] = useState('');
    const [image, setImage] = useState<{ file: File, preview: string } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [generatingTitleChatId, setGeneratingTitleChatId] = useState<string | null>(null);
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    const [isGoogleSearchEnabled, setGoogleSearchEnabled] = useState(true);
    const [isRecording, setIsRecording] = useState(false);
    const [showScrollTop, setShowScrollTop] = useState(false);
    
    // Quiz State
    const [showQuizModal, setShowQuizModal] = useState(false);
    const [quizTopic, setQuizTopic] = useState('');
    const [quizTopicForDisplay, setQuizTopicForDisplay] = useState('');
    const [quizNumQuestions, setQuizNumQuestions] = useState(5);
    const [quizDifficulty, setQuizDifficulty] = useState('Medium');
    const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [userAnswers, setUserAnswers] = useState<(number | null)[]>([]);
    const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
    const [isQuizModeActive, setIsQuizModeActive] = useState(false);
    const [quizStage, setQuizStage] = useState<'question' | 'results'>('question');
    const [quizScore, setQuizScore] = useState(0);

    const chatEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const recognitionRef = useRef<any>(null);
    const chatAreaRef = useRef<HTMLDivElement>(null);

    const currentChat = useMemo(() => chatsForClass.find(c => c.id === activeChatId), [chatsForClass, activeChatId]);
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
    
        return `You are Questionnaire, an expert academic AI assistant for a ${studentType}. Your sole purpose is to provide accurate, strictly academic, and informational answers based on the ${syllabusType}. You must politely decline any request that is not related to school subjects, competitive exams, or educational topics. This includes refusing to engage in casual conversation, jokes, or any non-academic activities. Your responses must be factual, encouraging, and easy to understand. Prioritize safety, accuracy, and relevance in all interactions.`;
    };

    // === Effects ===
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => {
        if (selectedClass) {
            localStorage.setItem('selectedClass', selectedClass.toString());
        } else {
            localStorage.removeItem('selectedClass');
        }
    }, [selectedClass]);

    // DB Initialization and Chat Loading
    useEffect(() => {
        const setup = async () => {
            try {
                await initDB();
                await migrateFromLocalStorage();
                setDbReady(true);
            } catch (err) {
                console.error("Database initialization failed:", err);
                alert("There was an error initializing the application's storage. Please ensure your browser supports IndexedDB and it's not disabled (e.g., in private browsing). The app may not function correctly.");
            }
        };
        setup();
    }, []);

    useEffect(() => {
        if (!dbReady || selectedClass === null) {
            setChatsForClass([]);
            setActiveChatId(null);
            return;
        }

        const loadChats = async () => {
            const chats = await getChatsForClass(selectedClass);
            setChatsForClass(chats);
            const savedActiveId = localStorage.getItem(`activeChatId_${selectedClass}`);
            if (savedActiveId && chats.some(c => c.id === savedActiveId)) {
                setActiveChatId(savedActiveId);
            } else if (chats.length > 0) {
                setActiveChatId(chats[0].id);
            } else {
                handleNewChat(selectedClass);
            }
        };
        loadChats();
    }, [selectedClass, dbReady]);
    
    // Side-effects for UI
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [currentMessages, currentQuestionIndex, isLoading]);
    
    useEffect(() => {
        const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognitionAPI) {
            const recognition = new SpeechRecognitionAPI();
            recognition.continuous = false;
            // recognition.lang = 'en-US'; // REMOVED: Use browser default for better accessibility
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
            setShowScrollTop(chatArea.scrollTop > chatArea.clientHeight / 2);
        };

        chatArea.addEventListener('scroll', handleScroll, { passive: true });
        return () => chatArea.removeEventListener('scroll', handleScroll);
    }, [selectedClass, activeChatId]);

    // Effect for handling clicks on dynamically generated copy buttons
    useEffect(() => {
        const chatArea = chatAreaRef.current;
        if (!chatArea) return;

        const handleClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            const copyBtn = target.closest<HTMLButtonElement>('.copy-code-btn');
            
            if (copyBtn && copyBtn.dataset.code) {
                navigator.clipboard.writeText(copyBtn.dataset.code);
                
                const checkSVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="${checkIconPath}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
                const copySVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="${copyIconPath}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
                
                copyBtn.innerHTML = `${checkSVG}<span>Copied!</span>`;
                copyBtn.setAttribute('aria-label', 'Code copied');
                copyBtn.disabled = true;
                
                setTimeout(() => {
                    copyBtn.innerHTML = `${copySVG}<span>Copy</span>`;
                    copyBtn.setAttribute('aria-label', 'Copy code');
                    copyBtn.disabled = false;
                }, 2000);
            }
        };

        chatArea.addEventListener('click', handleClick);
        return () => {
            chatArea.removeEventListener('click', handleClick);
        };
    }, [selectedClass, activeChatId]); // Rerun when chat area content might change

    // === Core Logic ===
    const generateTitleForChat = async (classNum: number, chatId: string, messages: ChatMessage[]) => {
        setGeneratingTitleChatId(chatId);
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
                    const chatToUpdate = chatsForClass.find(c => c.id === chatId);
                    if (chatToUpdate) {
                        const updatedChat = { ...chatToUpdate, title };
                        await updateChat(updatedChat);
                        setChatsForClass(prev => prev.map(c => c.id === chatId ? updatedChat : c));
                    }
                }
            }
        } catch (e) {
            console.error("Failed to generate chat title:", e);
        } finally {
            setGeneratingTitleChatId(null);
        }
    };
    
    const handleSendMessage = async (messageText: string) => {
        if ((!messageText.trim() && !image) || isLoading || !selectedClass || !activeChatId) return;

        const currentChat = chatsForClass.find(c => c.id === activeChatId);
        if (!currentChat) return;
    
        const userMessage: ChatMessage = { role: 'user', text: messageText };
        if (image) userMessage.image = image.preview;
    
        const updatedMessages: ChatMessage[] = [...currentChat.messages, userMessage, { role: 'model', text: '' }];
        const updatedChat = { ...currentChat, messages: updatedMessages };
        
        setChatsForClass(prev => prev.map(c => c.id === activeChatId ? updatedChat : c));
        await updateChat(updatedChat);
    
        setIsLoading(true);
        setInput('');
        const imageFile = image?.file;
        setImage(null);
    
        try {
            const historyForApi = currentChat.messages.map(m => ({
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
                await updateLastMessage({ role: 'model', text: data.text, sources: data.candidates?.[0]?.groundingMetadata?.groundingChunks });
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
                    await updateLastMessage({ role: 'model', text: fullResponse }, false); // Don't save to DB on every chunk
                }
                await updateLastMessage({ role: 'model', text: fullResponse }, true); // Save final message to DB
            }
    
        } catch (error) {
            console.error("Error sending message:", error);
            await updateLastMessage({ role: 'model', text: `Sorry, something went wrong. ${(error as Error).message}` });
        } finally {
            setIsLoading(false);
            if (currentChat.messages.length === 0 && selectedClass) { // Only title for the first message exchange
                // Refetch chat state to get the latest messages for title generation
                 const finalChatState = chatsForClass.find(c => c.id === activeChatId);
                 if (finalChatState && finalChatState.messages.length === 2) {
                    generateTitleForChat(selectedClass, activeChatId, finalChatState.messages);
                 }
            }
        }
    };

    const updateLastMessage = async (newMessage: ChatMessage, saveToDb = true) => {
        if (!activeChatId) return;

        setChatsForClass(prevChats => {
            const chatToUpdate = prevChats.find(c => c.id === activeChatId);
            if (!chatToUpdate) return prevChats;

            const newMessages = [...chatToUpdate.messages];
            newMessages[newMessages.length - 1] = newMessage;
            const updatedChat = { ...chatToUpdate, messages: newMessages };

            if (saveToDb) {
                updateChat(updatedChat);
            }

            return prevChats.map(c => c.id === activeChatId ? updatedChat : c);
        });
    };

    const addNewMessage = async (newMessage: ChatMessage) => {
        if (!activeChatId) return;
        const chatToUpdate = chatsForClass.find(c => c.id === activeChatId);
        if (!chatToUpdate) return;

        const updatedChat = { ...chatToUpdate, messages: [...chatToUpdate.messages, newMessage] };
        setChatsForClass(prev => prev.map(c => c.id === activeChatId ? updatedChat : c));
        await updateChat(updatedChat);
    };
    
    const handleNewChat = async (classNum?: number) => {
        const targetClass = classNum || selectedClass;
        if (!targetClass) return;
        
        const newChatData = {
            id: Date.now().toString(),
            classNum: targetClass,
            title: '',
            messages: []
        };
        const newChat = await addChat(newChatData);
        setChatsForClass(prev => [newChat, ...prev]);
        handleSelectChat(newChat.id);
    };

    const handleSelectChat = (chatId: string) => {
        if (!selectedClass) return;
        setIsQuizModeActive(false);
        setQuizQuestions([]);
        setActiveChatId(chatId);
        localStorage.setItem(`activeChatId_${selectedClass}`, chatId);
    };

    const handleDeleteChat = async (chatIdToDelete: string) => {
        if (!selectedClass) return;

        await deleteChat(chatIdToDelete);
        const remainingChats = chatsForClass.filter(c => c.id !== chatIdToDelete);
        setChatsForClass(remainingChats);

        if (activeChatId === chatIdToDelete) {
            if (remainingChats.length > 0) {
                handleSelectChat(remainingChats[0].id);
            } else {
                handleNewChat();
            }
        }
    };
    
    const handleSummarizeChat = async () => {
        if (!currentChat || currentMessages.length < 2 || isLoading) return;

        setIsLoading(true);
        const conversation = currentMessages.map(m => `${m.role === 'user' ? 'Student' : 'Assistant'}: ${m.text}`).join('\n');
        
        await addNewMessage({ role: 'model', text: '' });
        
        try {
            const response = await fetch('/api/summarize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversation }),
            });
    
            if (!response.ok) throw new Error('Failed to get summary.');
    
            const data = await response.json();
            await updateLastMessage({ role: 'model', text: `**Chat Summary:**\n\n${data.summary}` });
        } catch (error) {
            console.error("Error summarizing chat:", error);
            await updateLastMessage({ role: 'model', text: 'Sorry, I was unable to summarize the chat.' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleExportChat = () => {
        if (!selectedClass || currentMessages.length === 0) return;
        const historyText = currentMessages.map(msg => `## ${msg.role === 'user' ? 'You' : 'Questionnaire'}\n\n${msg.text}`).join('\n\n---\n\n');
        const blob = new Blob([historyText], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Questionnaire-Class${selectedClass}-chat.md`;
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

        setQuizTopicForDisplay(quizTopic);
        setIsLoading(true);
        setShowQuizModal(false);
        await addNewMessage({ role: 'user', text: `Start a quiz on: ${quizTopic}` });
        await addNewMessage({ role: 'model', text: '' });
        
        try {
            const response = await fetch('/api/quiz', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topic: quizTopic,
                    systemInstruction: getSystemInstruction(selectedClass),
                    numQuestions: quizNumQuestions,
                    difficulty: quizDifficulty,
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

            await updateLastMessage({ role: 'model', text: "Great! Let's test your knowledge. Starting the quiz now..." });
            setQuizQuestions(data.quiz);
            setUserAnswers(new Array(data.quiz.length).fill(null));
            setCurrentQuestionIndex(0);
            setSelectedAnswer(null);
            setQuizStage('question');
            setIsQuizModeActive(true);

        } catch (error) {
            console.error("Quiz generation failed:", error);
            await updateLastMessage({ role: 'model', text: `Sorry, I couldn't create a quiz for that topic. ${(error as Error).message}` });
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
                let score = 0;
                quizQuestions.forEach((q, i) => {
                    if (q.correctAnswerIndex === newAnswers[i]) score++;
                });
                setQuizScore(score);
                setQuizStage('results');
                
                const scoreMessage = `## Quiz Complete!\n\n**Topic: ${quizTopicForDisplay}**\n**Final score: ${score} out of ${quizQuestions.length}**`;
                addNewMessage({ role: 'model', text: scoreMessage });
            }
        }, 2500);
    };

    const handleFinishQuiz = () => {
        setIsQuizModeActive(false);
        setQuizQuestions([]);
        setUserAnswers([]);
        setCurrentQuestionIndex(0);
        setSelectedAnswer(null);
    };


    return (
        <>
            <GlobalSvgDefs />
            <DesktopOnlyView />
            <div className="app-container">
                <style>{`
                    /* === Base & Theme === */
                    :root {
                        --bg-primary: #ffffff; --bg-secondary: #f0f4f9; --bg-tertiary: #e1e8f0;
                        --text-primary: #121212; --text-secondary: #555555;
                        --accent-primary: #121212; --accent-secondary: #333333;
                        --border-color: #d1d9e6;
                        --font-heading: 'Google Sans', sans-serif; --font-body: 'Montserrat', sans-serif;
                        --shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
                        --gemini-gradient: linear-gradient(90deg, #F97721, #F2A93B, #88D7E4, #2D79C7);
                        --correct-color: #2e7d32; --incorrect-color: #c62828;
                        --modal-overlay-bg: rgba(240, 244, 249, 0.5);
                    }
                    [data-theme='dark'] {
                        --bg-primary: #121212; --bg-secondary: #1e1e1e; --bg-tertiary: #2a2a2a;
                        --text-primary: #e0e0e0; --text-secondary: #aaaaaa;
                        --accent-primary: #ffffff; --accent-secondary: #cccccc;
                        --border-color: #333333;
                        --correct-color: #66bb6a; --incorrect-color: #ef5350;
                        --modal-overlay-bg: rgba(18, 18, 18, 0.5);
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
                    .initial-class-selector svg { margin-bottom: 8px; }
                    .title-main { font-family: var(--font-heading); font-size: 5rem; }
                    .title-main .gemini-gradient-text { animation: subtle-glow 2.5s ease-out 0.5s 1; }
                    .title-main span { font-size: inherit; font-weight: 500; }
                    .subtitle { color: var(--text-secondary); font-size: 1.3rem; margin-top: 4px; }
                    .disclaimer-warning { font-family: var(--font-body); font-size: 0.8rem; color: var(--text-secondary); max-width: 400px; margin-top: -8px; line-height: 1.4; }
                    h2 { margin-top: 20px; font-family: var(--font-heading); font-weight: 500;}
                    .class-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-top: 16px; width: 100%; max-width: 600px; }
                    .class-button { background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); padding: 12px 20px; border-radius: 12px; cursor: pointer; font-size: 1rem; font-family: var(--font-heading); font-weight: 500; position: relative; overflow: hidden; z-index: 1; transition: all 0.25s ease-out; }

                    /* === Main Layout === */
                    .app-container { display: flex; height: 100vh; }
                    .sidebar { width: 260px; background-color: var(--bg-secondary); padding: 24px; display: flex; flex-direction: column; border-right: 1px solid var(--border-color); transition: transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1), margin-left 0.3s cubic-bezier(0.25, 0.1, 0.25, 1); transform: translateX(0); }
                    .chat-main { flex: 1; display: flex; flex-direction: column; position: relative; background-color: var(--bg-primary); transition: width 0.3s ease-in-out; }
                    
                    /* === Sidebar === */
                    .sidebar-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
                    .sidebar-header .logo-container { display: flex; justify-content: center; align-items: center; width: 48px; height: 48px; flex-shrink: 0; margin-left: -8px; }
                    .sidebar-header .logo-container svg { transition: transform 0.3s ease-out, filter 0.4s ease-out; }
                    .sidebar-title { font-family: var(--font-heading); font-size: 1.5rem; transform-origin: left center; transition: transform 0.3s ease-out; line-height: 1.2; }
                    .sidebar-tagline { font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px; line-height: 1.3; }
                    .sidebar-btn { width: 100%; padding: 12px; background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 12px; cursor: pointer; font-size: 0.9rem; text-align: left; display: flex; align-items: center; justify-content: flex-start; gap: 8px; font-family: var(--font-heading); font-weight: 500; position: relative; z-index: 1; overflow: hidden; transition: all 0.25s ease-out; }
                    .sidebar-btn:disabled { background-color: var(--bg-tertiary); color: var(--text-secondary); cursor: not-allowed; opacity: 0.6; }
                    .sidebar-content { display: flex; flex-direction: column; gap: 12px; flex-grow: 1; overflow: hidden; }
                    .chat-history-container { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; margin-top: 16px; padding-right: 8px; }
                    .history-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-radius: 12px; cursor: pointer; transition: background-color 0.2s ease-out; }
                    .history-item.active { background-color: var(--accent-primary); color: var(--bg-primary); }
                    .history-item span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.9rem; }
                    .history-delete-btn { background: none; border: none; color: var(--text-secondary); cursor: pointer; opacity: 0; transition: opacity 0.2s ease-out; }
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

                    @keyframes spinner { to { transform: rotate(360deg); } }
                    .title-loader { display: inline-block; width: 12px; height: 12px; border: 2px solid var(--text-secondary); border-top-color: transparent; border-radius: 50%; animation: spinner 0.6s linear infinite; margin-left: 8px; vertical-align: middle; }
                    .history-item-title { display: flex; align-items: center; overflow: hidden; }

                    /* === Futuristic Hover Effects (Desktop Only) === */
                    .class-button::before, .sidebar-btn::before, .modal-btn.submit::before {
                         content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: var(--gemini-gradient); z-index: -1; opacity: 0; transition: opacity 0.3s ease-out;
                    }
                    
                    @media (hover: hover) {
                        .sidebar-header:hover .sidebar-title { transform: scale(1.05); }
                        .sidebar-header:hover svg { 
                            transform: scale(1.1); 
                            filter: drop-shadow(0 0 4px rgba(242, 169, 59, 0.4)) 
                                    drop-shadow(0 0 8px rgba(249, 119, 33, 0.2));
                        }
                        .sidebar-header:hover .logo-paths { stroke: url(#gemini-gradient-svg); }
                        .class-button:hover, .sidebar-btn:not(:disabled):hover { color: #fff; border-color: transparent; box-shadow: 0 -6px 20px -5px rgba(249, 119, 33, 0.7), 0 6px 20px -5px rgba(45, 121, 199, 0.7); }
                        [data-theme='dark'] .class-button:hover, [data-theme='dark'] .sidebar-btn:not(:disabled):hover { color: #fff; }
                        .class-button:hover::before, .sidebar-btn:not(:disabled):hover::before { opacity: 1; }
                        .history-item:hover { background-color: var(--bg-tertiary); }
                        .history-item:hover .history-delete-btn { opacity: 1; }
                        .chat-message:hover .copy-btn { visibility: visible; opacity: 1; }
                        .modal-btn.submit:not(:disabled):hover { color: #fff; box-shadow: 0 -6px 20px -5px rgba(249, 119, 33, 0.7), 0 6px 20px -5px rgba(45, 121, 199, 0.7); }
                        [data-theme='dark'] .modal-btn.submit:not(:disabled):hover { color: #fff; }
                        .modal-btn.submit:not(:disabled):hover::before { opacity: 1; }
                        .quiz-option-btn:not(:disabled):hover { border-color: var(--accent-primary); background: var(--bg-tertiary); }
                    }

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
                    .role-model .message-content {
                        font-size: 1rem;
                        font-weight: 400;
                    }
                    .role-user .message-content {
                        font-size: 23px;
                        font-weight: 400;
                        text-align: right;
                    }
                    
                    .message-content p, .message-content h3 { margin-bottom: 1em; }
                    .message-content ol, .message-content ul { padding-left: 20px; margin-bottom: 1em; }
                    .message-content pre { background-color: var(--bg-tertiary); padding: 16px; border-radius: 12px; overflow-x: auto; margin: 12px 0; font-family: 'Courier New', Courier, monospace; white-space: pre-wrap; word-wrap: break-word; text-align: left; }
                    .role-model .message-content pre { background-color: var(--bg-primary); }
                    [data-theme='dark'] .role-model .message-content pre { background-color: var(--bg-tertiary); }
                    .message-content code:not(pre > code) { background-color: var(--bg-tertiary); padding: 2px 4px; border-radius: 6px; font-family: 'Courier New', Courier, monospace; }
                    .message-image { max-width: 300px; border-radius: 12px; margin-bottom: 8px; }
                    .copy-btn { background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; border-radius: 4px; transition: all 0.2s ease-out; visibility: hidden; opacity: 0; }
                    .message-sources { font-size: 0.9rem; margin-top: 16px; color: var(--text-secondary); text-align: left; }
                    .message-sources hr { border: none; border-top: 1px solid var(--border-color); margin: 12px 0; }
                    .source-link { text-decoration: none; color: var(--accent-primary); font-weight: 600; background: var(--bg-tertiary); padding: 1px 4px; border-radius: 4px; }

                    /* Code Block Enhancements */
                    .code-block-wrapper { position: relative; }
                    .copy-code-btn { position: absolute; top: 8px; right: 8px; background: var(--bg-tertiary); color: var(--text-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 4px 8px; cursor: pointer; display: flex; align-items: center; gap: 4px; font-size: 0.8rem; opacity: 0; transition: opacity 0.2s ease-out; }
                    .code-block-wrapper:hover .copy-code-btn { opacity: 1; }
                    .copy-code-btn:hover { background: var(--border-color); color: var(--text-primary); }

                    /* Chat Welcome Screen */
                    .chat-welcome-screen { display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; text-align: center; animation: fadeIn 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards; }
                    .chat-welcome-screen h1 { font-family: 'Google Sans', sans-serif; font-size: 5rem; font-weight: 500; }
                    .chat-welcome-screen p { margin-top: 8px; font-size: 1.1rem; color: var(--text-secondary); max-width: 400px; }
                    .chat-welcome-screen .prompt-suggestions { margin-top: 32px; display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; max-width: 700px; }
                    
                    /* Skeleton Loader */
                    @keyframes shimmer {
                        0% { background-position: -400px 0; }
                        100% { background-position: 400px 0; }
                    }
                    .skeleton-loader { display: flex; flex-direction: column; gap: 10px; padding-top: 8px; }
                    .skeleton-line {
                        height: 16px;
                        background-color: var(--bg-tertiary);
                        background-image: linear-gradient(to right, var(--bg-tertiary) 0%, var(--border-color) 20%, var(--bg-tertiary) 40%, var(--bg-tertiary) 100%);
                        background-repeat: no-repeat;
                        background-size: 800px 104px;
                        border-radius: 8px;
                        animation: shimmer 1.5s linear infinite;
                    }

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

                    /* === Quiz Modal === */
                    .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--modal-overlay-bg); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 200; display: flex; justify-content: center; align-items: center; animation: fadeIn 0.2s ease-out; }
                    .modal-content { background: var(--bg-primary); padding: 32px; border-radius: 20px; width: 90%; max-width: 500px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
                    .quiz-setup-modal .modal-header { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
                    .quiz-setup-modal .modal-header-icon { color: var(--accent-primary); }
                    .quiz-setup-modal .modal-header h3 { font-family: var(--font-heading); font-size: 1.8rem; font-weight: 700; }
                    .quiz-setup-modal .modal-subtitle { color: var(--text-secondary); margin-bottom: 24px; margin-left: 44px; font-size: 0.9rem; }
                    
                    .modal-form-group { margin-bottom: 20px; }
                    .modal-form-group label { display: block; margin-bottom: 8px; font-size: 0.9rem; color: var(--text-secondary); font-family: var(--font-heading); font-weight: 500; padding-left: 4px; }

                    .modal-input-wrapper { position: relative; border-radius: 12px; padding: 2px; background: var(--border-color); transition: background 0.3s; }
                    .modal-input-wrapper:focus-within { background: var(--gemini-gradient); }
                    .modal-input-wrapper svg { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-secondary); pointer-events: none; transition: color 0.3s; }
                    .modal-input-wrapper:focus-within svg { color: var(--text-primary); }

                    .modal-input { width: 100%; padding: 12px 16px 12px 44px; border-radius: 10px; border: none; background: var(--bg-secondary); color: var(--text-primary); font-family: var(--font-heading); font-size: 1.1rem; }
                    .modal-input:focus { outline: none; background: var(--bg-primary); }
                    
                    .modal-buttons { display: flex; justify-content: flex-end; gap: 12px; margin-top: 32px; }
                    .modal-btn { padding: 12px 24px; border: none; border-radius: 12px; cursor: pointer; font-family: var(--font-heading); font-weight: 500; transition: opacity 0.2s; font-size: 1rem; }
                    .modal-btn.cancel { background: var(--bg-tertiary); color: var(--text-primary); }
                    .modal-btn.submit { background: var(--accent-primary); color: var(--bg-primary); position: relative; z-index: 1; overflow: hidden; transition: all 0.25s ease-out; border: 1px solid transparent; }
                    .modal-btn:disabled { opacity: 0.5; cursor: not-allowed; }

                    /* === Custom Accessible Select === */
                    .custom-select-label { display: block; margin-bottom: 8px; font-size: 0.9rem; color: var(--text-secondary); font-family: var(--font-heading); font-weight: 500; padding-left: 4px; }
                    .custom-select-wrapper { position: relative; }
                    .custom-select-button { width: 100%; display: flex; justify-content: space-between; align-items: center; background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; padding: 14px 16px; font-size: 1.1rem; color: var(--text-primary); font-family: var(--font-heading); cursor: pointer; text-align: left; transition: border-color 0.2s; }
                    .custom-select-button:focus { outline: none; border-color: var(--accent-primary); box-shadow: 0 0 0 2px rgba(136, 215, 228, 0.3); }
                    .custom-select-button svg { transition: transform 0.2s ease-in-out; }
                    .custom-select-button[aria-expanded="true"] svg { transform: rotate(180deg); }
                    .custom-select-options { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 12px; padding: 8px; z-index: 10; max-height: 200px; overflow-y: auto; box-shadow: var(--shadow); list-style: none; }
                    .custom-select-option { padding: 10px 12px; border-radius: 8px; cursor: pointer; transition: background-color 0.2s; font-size: 1.1rem; }
                    .custom-select-option.active { background-color: var(--bg-tertiary); }
                    .custom-select-option[aria-selected="true"] { font-weight: 500; color: var(--accent-primary); }
                    
                    /* === Quiz Dialog === */
                    .quiz-dialog {
                        background: var(--bg-primary);
                        border-radius: 16px;
                        width: 90%;
                        max-width: 800px;
                        height: 90%;
                        max-height: 700px;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                        animation: fadeIn 0.3s ease-out;
                    }
                    .quiz-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 16px 24px;
                        border-bottom: 1px solid var(--border-color);
                        flex-shrink: 0;
                    }
                    .quiz-header h3 {
                        font-family: var(--font-heading);
                        font-size: 1.2rem;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }
                    .quiz-close-btn {
                        background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; border-radius: 50%;
                        display: flex; align-items: center; justify-content: center; transition: background-color 0.2s, color 0.2s;
                    }
                    .quiz-close-btn:hover { background-color: var(--bg-tertiary); color: var(--text-primary); }
                    .quiz-content {
                        flex-grow: 1;
                        overflow-y: auto;
                        padding: 24px;
                        display: flex;
                        flex-direction: column;
                    }

                    .quiz-progress-bar { padding: 0 0 16px 0; width: 100%; flex-shrink: 0; }
                    .quiz-progress-bar .progress-text { font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 8px; }
                    .quiz-progress-bar .progress-track { width: 100%; height: 6px; background: var(--bg-tertiary); border-radius: 3px; overflow: hidden; }
                    .quiz-progress-bar .progress-fill { height: 100%; background: var(--gemini-gradient); border-radius: 3px; transition: width 0.3s ease-out; }

                    /* Quiz View */
                    .quiz-view { flex-grow: 1; animation: fadeIn 0.5s ease-out; }
                    .quiz-view .message-content { font-family: var(--font-heading); font-size: 1.25rem; }
                    .quiz-options { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0 16px 48px; }
                    .quiz-option-btn { width: 100%; padding: 14px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 12px; cursor: pointer; text-align: left; transition: all 0.2s ease-out; font-family: var(--font-heading); font-size: 1rem; }
                    .quiz-option-btn.correct { background-color: var(--correct-color); color: white; border-color: var(--correct-color); }
                    .quiz-option-btn.incorrect { background-color: var(--incorrect-color); color: white; border-color: var(--incorrect-color); }
                    .quiz-option-btn:disabled { cursor: not-allowed; opacity: 0.8; }
                    .quiz-explanation { margin-left: 48px; padding: 12px; background: var(--bg-secondary); border-radius: 8px; font-size: 0.9rem; animation: fadeIn 0.3s ease-out; }
                    
                    /* Quiz Results */
                    .quiz-results-view { flex-grow: 1; display: flex; flex-direction: column; align-items: center; text-align: center; animation: fadeIn 0.5s ease-out; }
                    .results-title { font-family: var(--font-heading); font-size: 2.5rem; margin-bottom: 24px; }
                    .score-chart { position: relative; width: 120px; height: 120px; margin-bottom: 24px; }
                    .score-chart svg { transform: rotate(-90deg); }
                    .score-chart-track { fill: none; stroke: var(--bg-tertiary); stroke-width: 10; }
                    .score-chart-progress { fill: none; stroke-width: 10; stroke-linecap: round; transition: stroke-dashoffset 0.8s ease-out; }
                    .score-text { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-family: var(--font-heading); }
                    .score-text strong { font-size: 2rem; color: var(--text-primary); }
                    .score-text span { font-size: 1rem; color: var(--text-secondary); }
                    .score-summary { font-size: 1.1rem; margin-bottom: 32px; }
                    .results-actions { display: flex; gap: 16px; }
                    .results-btn { padding: 12px 24px; border: 1px solid var(--border-color); border-radius: 12px; cursor: pointer; font-family: var(--font-heading); font-weight: 500; font-size: 1rem; transition: all 0.2s ease-out; }
                    .results-btn.finish { background: var(--bg-tertiary); color: var(--text-primary); }
                    .results-btn.try-again { background: var(--accent-primary); color: var(--bg-primary); border-color: var(--accent-primary); }

                    /* Performance Report in Quiz Results */
                    .performance-report {
                        margin-top: 32px;
                        width: 100%;
                        text-align: left;
                        border-top: 1px solid var(--border-color);
                        padding-top: 24px;
                    }
                    .performance-report h3 {
                        font-family: var(--font-heading);
                        font-size: 1.5rem;
                        text-align: center;
                        margin-bottom: 8px;
                    }
                    .report-intro {
                        text-align: center;
                        color: var(--text-secondary);
                        margin-bottom: 24px;
                    }
                    .report-item {
                        background: var(--bg-secondary);
                        padding: 16px;
                        border-radius: 12px;
                        margin-bottom: 16px;
                    }
                    .report-question {
                        font-weight: 500;
                        margin-bottom: 12px;
                    }
                    .report-question p { margin-bottom: 0; }
                    .report-answer {
                        font-size: 0.9rem;
                        padding: 8px 12px;
                        border-left: 3px solid;
                        border-radius: 0 8px 8px 0;
                    }
                    .report-answer strong { color: var(--text-secondary); }
                    .your-answer {
                        border-color: var(--incorrect-color);
                        background-color: color-mix(in srgb, var(--incorrect-color) 10%, transparent);
                        margin-bottom: 8px;
                    }
                    .correct-answer {
                        border-color: var(--correct-color);
                        background-color: color-mix(in srgb, var(--correct-color) 10%, transparent);
                    }

                    /* === Desktop Only View === */
                    .desktop-only-container {
                        display: none;
                        flex-direction: column;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        text-align: center;
                        padding: 20px;
                        gap: 16px;
                        background-color: var(--bg-primary);
                        color: var(--text-primary);
                    }

                    /* === Responsive Design === */
                    @media (max-width: 1024px) {
                        .app-container {
                            display: none;
                        }
                        .desktop-only-container {
                            display: flex;
                        }
                    }

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
                        .role-user .message-content { font-size: 1rem; }
                        .role-model .message-content { font-size: 0.95rem; }
                    }
                `}</style>

                {showQuizModal && <QuizModal
                    onStart={handleStartQuiz}
                    onCancel={() => setShowQuizModal(false)}
                    topic={quizTopic}
                    setTopic={setQuizTopic}
                    numQuestions={quizNumQuestions}
                    setNumQuestions={setQuizNumQuestions}
                    difficulty={quizDifficulty}
                    // FIX: Pass the correct state setter `setQuizDifficulty` for the `setDifficulty` prop.
                    setDifficulty={setQuizDifficulty}
                />}

                <div className="app-container">
                    <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
                        <div className="sidebar-header">
                            <div className="logo-container"><BHSLogo size={40} /></div>
                            <div>
                                <h1 className="sidebar-title">Questionnaire</h1>
                                <p className="sidebar-tagline">Smarter than your homework excuses!</p>
                            </div>
                        </div>
                        <div className="sidebar-content">
                            <button className="sidebar-btn" onClick={() => handleNewChat()} disabled={!selectedClass}>
                                <Icon path="M12 5v14m-7-7h14" size={16} /> New Chat
                            </button>
                            <div className="chat-history-container">
                                {chatsForClass.map((chat) => (
                                    <div key={chat.id} className={`history-item ${chat.id === activeChatId ? 'active' : ''}`} onClick={() => handleSelectChat(chat.id)}>
                                        <div className="history-item-title">
                                            <span>{chat.title || chat.messages[0]?.text.substring(0, 25) || 'New Chat...'}</span>
                                            {generatingTitleChatId === chat.id && <div className="title-loader"></div>}
                                        </div>
                                        <button className="history-delete-btn" onClick={(e) => { 
                                            e.stopPropagation();
                                            if(window.confirm('Are you sure you want to permanently delete this chat?')) {
                                                handleDeleteChat(chat.id)
                                            }
                                        }} aria-label="Delete chat">
                                            <Icon path="M18 6L6 18M6 6l12 12" size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <hr style={{borderColor: 'var(--border-color)', opacity: 0.5, margin: '16px 0'}}/>
                            <button className="sidebar-btn" onClick={() => setShowQuizModal(true)} disabled={!selectedClass || isLoading}>
                                <Icon path="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" size={16} /> Start Quiz
                            </button>
                            <button className="sidebar-btn" onClick={handleSummarizeChat} disabled={!currentChat || currentMessages.length < 2 || isLoading}>
                                <Icon path="M3 6h18M3 12h18M3 18h18" size={16} /> Summarize Chat
                            </button>
                            <button className="sidebar-btn" onClick={handleExportChat} disabled={!currentChat || currentMessages.length === 0 || isLoading}>
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
                            <h2 className="sidebar-title">Questionnaire</h2>
                        </div>

                        <div className="chat-area" ref={chatAreaRef}>
                            {selectedClass === null ? <InitialClassSelector onSelectClass={setSelectedClass} /> :
                            currentMessages.length === 0 && !isLoading ? <ChatWelcomeScreen suggestions={promptSuggestions[selectedClass] || []} onSendMessage={handleSendMessage} /> :
                                (
                                    currentMessages.map((msg, index) => (
                                        <Message 
                                            key={index}
                                            msgIndex={index}
                                            msg={msg} 
                                            isLastMessage={index === currentMessages.length - 1}
                                            isLoading={isLoading}
                                        />
                                    ))
                                )
                            }
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
                                        <button type="submit" className="input-btn send-btn" disabled={isLoading || (!input.trim() && !image)}>
                                            <Icon path="M5 12h14m-7-7l7 7-7 7" />
                                        </button>
                                    </form>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {selectedClass !== null && isQuizModeActive && (
                    <div className="modal-overlay">
                        <div className="quiz-dialog">
                            <div className="quiz-header">
                                    <h3>{quizTopicForDisplay || 'Quiz'}</h3>
                                    <button onClick={handleFinishQuiz} className="quiz-close-btn" aria-label="Finish Quiz">
                                    <Icon path="M18 6L6 18M6 6l12 12" />
                                    </button>
                            </div>
                            <div className="quiz-content">
                                {quizStage === 'question' && quizQuestions.length > 0 && (
                                        <>
                                        <QuizProgressBar current={currentQuestionIndex + 1} total={quizQuestions.length} />
                                        <QuizView 
                                            question={quizQuestions[currentQuestionIndex]}
                                            onAnswerSelect={handleAnswerSelect}
                                            selectedAnswer={selectedAnswer}
                                        />
                                        </>
                                )}
                                {quizStage === 'results' && (
                                    <QuizResults 
                                        score={quizScore}
                                        total={quizQuestions.length}
                                        onTryAgain={() => { 
                                            handleFinishQuiz(); 
                                            setShowQuizModal(true); 
                                        }}
                                        onFinish={handleFinishQuiz}
                                        questions={quizQuestions}
                                        userAnswers={userAnswers}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

export default App;
