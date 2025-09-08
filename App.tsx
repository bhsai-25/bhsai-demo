





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
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true');
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

    useEffect(() => {
        localStorage.setItem('sidebarCollapsed', String(isSidebarCollapsed));
    }, [isSidebarCollapsed]);

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

