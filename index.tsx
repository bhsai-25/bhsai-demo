import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
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

const App = () => {
    // === State Management ===
    const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
    const [selectedClass, setSelectedClass] = useState<number | null>(() => {
        const savedClass = localStorage.getItem('selectedClass');
        return savedClass ? parseInt(savedClass, 10) : null;
    });
    
    const [chatHistories, setChatHistories] = useState<{ [classNum: number]: { [chatId: string]: ChatMessage[] } }>(() => {
        const saved = localStorage.getItem('chatHistories');
        return saved ? JSON.parse(saved) : {};
    });
    const [activeChatIds, setActiveChatIds] = useState<{ [classNum: number]: string }>(() => {
        const saved = localStorage.getItem('activeChatIds');
        return saved ? JSON.parse(saved) : {};
    });

    const [input, setInput] = useState('');
    const [image, setImage] = useState<{ file: File, preview: string } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    const [isGoogleSearchEnabled, setGoogleSearchEnabled] = useState(false);
    const [isRecording, setIsRecording] = useState(false);

    const chatEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const recognitionRef = useRef<any>(null); // For SpeechRecognition

    const activeChatId = selectedClass ? activeChatIds[selectedClass] : null;
    const currentMessages = (selectedClass && activeChatId && chatHistories[selectedClass]?.[activeChatId]) || [];

    // === Data ===
    const promptSuggestions: { [key: number]: string[] } = {
        6: ["Explain the solar system.", "Who was the first emperor of the Mauryan dynasty?", "Summarize a story from the 'Honeysuckle' textbook."],
        7: ["What is the difference between acids and bases?", "Describe the function of the human heart.", "Explain the rise of the Mughal Empire."],
        8: ["What is a cell and what are its main parts?", "Explain the process of crop production.", "Describe the Indian Rebellion of 1857."],
        9: ["What are Newton's laws of motion?", "Explain the structure of an atom.", "Discuss the features of democracy."],
        10: ["Explain chemical reactions and equations.", "What were the causes of World War I?", "Describe the process of reflection of light by spherical mirrors."],
        11: ["Explain the concept of sets in mathematics.", "What is projectile motion?", "Discuss the fundamental rights in the Indian Constitution."],
        12: ["Explain electric charge and fields.", "Discuss the principles of inheritance and variation.", "What is the structure of a C++ program?"]
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
    }, [currentMessages]);
    
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

    // === Core Logic ===
    const handleSendMessage = async (messageText: string) => {
        if ((!messageText.trim() && !image) || isLoading || !selectedClass || !activeChatId) return;
    
        const userMessage: ChatMessage = { role: 'user', text: messageText };
        if (image) userMessage.image = image.preview;
    
        const currentChatHistory = chatHistories[selectedClass]?.[activeChatId] || [];
        setChatHistories(prev => ({
            ...prev,
            [selectedClass]: {
                ...prev[selectedClass],
                [activeChatId]: [...currentChatHistory, userMessage, { role: 'model', text: '' }]
            }
        }));
    
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
                    systemInstruction: `You are bhsAI, a friendly, academic, and highly creative AI assistant for a Class ${selectedClass} student of Birla High School Mukundapur. Your responses must be encouraging, easy to understand, and strictly tailored to the NCERT syllabus for Class ${selectedClass}. You must decline to answer any questions that are not related to academics, are inappropriate, or are unrelated to the student's curriculum. Prioritize safety and relevance in all interactions.`,
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
            updateLastMessage({ role: 'model', text: `Sorry, something went wrong. ${error.message}` });
        } finally {
            setIsLoading(false);
        }
    };

    const updateLastMessage = (newMessage: ChatMessage) => {
        if (!selectedClass || !activeChatId) return;
        setChatHistories(prev => {
            const newHistories = { ...prev };
            const classHistory = newHistories[selectedClass];
            if (classHistory && classHistory[activeChatId]) {
                const currentChatHistory = [...classHistory[activeChatId]];
                if (currentChatHistory.length > 0 && currentChatHistory[currentChatHistory.length - 1].role === 'model') {
                    currentChatHistory[currentChatHistory.length - 1] = newMessage;
                } else {
                     currentChatHistory.push(newMessage);
                }
                classHistory[activeChatId] = currentChatHistory;
                return { ...prev, [selectedClass]: { ...classHistory } };
            }
            return prev;
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
                [newChatId]: []
            }
        }));
        setActiveChatIds(prev => ({ ...prev, [targetClass]: newChatId }));
    };

    const handleSelectChat = (chatId: string) => {
        if (!selectedClass) return;
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
        
        setChatHistories(prev => ({
            ...prev,
            [selectedClass]: {
                ...prev[selectedClass],
                [activeChatId]: [...(prev[selectedClass]?.[activeChatId] || []), { role: 'model', text: '' }]
            }
        }));
        
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

    // === Components ===
    const BHSLogo = ({ className }: { className?: string }) => (
        <svg className={className} width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ stroke: 'currentColor', strokeWidth: 1.5 }}>
            <path d="M12 2L2 7L12 12L22 7L12 2Z" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 17L12 22L22 17" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 12L12 17L22 12" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    );
    
    const Icon = ({ path, size = 24 }: { path: string, size?: number }) => (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d={path} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    );

    const TypingIndicator = () => (
        <p className="typing-indicator">Typing...</p>
    );
    
    const Message = ({ msg, index }: { msg: ChatMessage, index: number }) => {
        const [copied, setCopied] = useState(false);
        const handleCopy = () => {
            navigator.clipboard.writeText(msg.text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        };

        const isLastMessage = index === currentMessages.length - 1;
        const showTyping = isLoading && isLastMessage && msg.role === 'model';
        
        return (
            <div className={`chat-message role-${msg.role}`}>
                {msg.role === 'model' && <div className="message-avatar"><BHSLogo /></div>}
                <div className="message-content-wrapper">
                    <div className="message-content">
                        {msg.image && <img src={msg.image} alt="User upload" className="message-image" />}
                        {showTyping && !msg.text ? <TypingIndicator /> : <div className={msg.role === 'model' && msg.text ? 'model-text-fade-in' : ''} dangerouslySetInnerHTML={{ __html: marked.parse(msg.text) as string }}></div>}
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
    };

    const InitialClassSelector = () => (
        <div className="initial-class-selector">
            <BHSLogo />
            <h1 className="title-main"><span>Welcome to </span><span className="gemini-gradient-text">bhsAI</span></h1>
            <p className="subtitle">Your academic assistant from Birla High School Mukundapur</p>
            <p className="disclaimer-warning">Please be respectful and refrain from sending inappropriate messages.</p>
            <h2>Please select your class to begin</h2>
            <div className="class-grid">
                {Array.from({ length: 7 }, (_, i) => i + 6).map(grade => (
                    <button key={grade} onClick={() => setSelectedClass(grade)} className="class-button">
                        Class {grade}
                    </button>
                ))}
            </div>
            <p className="creator-credit">Created by Shreyansh and Aarush</p>
        </div>
    );
    
    const ChatWelcomeScreen = () => (
        <div className="chat-welcome-screen">
            <h1><span className="welcome-hi">Hi, </span><span className="gemini-gradient-text">Student</span></h1>
            <p>Your academic assistant is ready to help. What would you like to explore today?</p>
            <div className="prompt-suggestions">
                {promptSuggestions[selectedClass as number]?.map(p => (
                    <button key={p} className="suggestion-btn" onClick={() => handleSendMessage(p)}>{p}</button>
                ))}
            </div>
        </div>
    );

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
                }
                [data-theme='dark'] {
                    --bg-primary: #121212; --bg-secondary: #1e1e1e; --bg-tertiary: #2a2a2a;
                    --text-primary: #e0e0e0; --text-secondary: #aaaaaa;
                    --accent-primary: #ffffff; --accent-secondary: #cccccc;
                    --border-color: #333333;
                }
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { background-color: var(--bg-primary); color: var(--text-primary); font-family: var(--font-body); transition: background-color 0.3s, color 0.3s; overflow: hidden; }
                .gemini-gradient-text { background: var(--gemini-gradient); -webkit-background-clip: text; background-clip: text; color: transparent; }

                @keyframes gradient-flow {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                
                .model-text-fade-in {
                    animation: fadeIn 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                }

                /* === Initial Class Selector === */
                .initial-class-selector { display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; text-align: center; padding: 20px; gap: 16px; position: relative; }
                .title-main { font-family: var(--font-heading); font-size: 4.5rem; font-weight: 700; }
                .title-main .gemini-gradient-text { 
                    font-weight: 700; 
                }
                .title-main span { font-size: inherit; font-weight: 400; }
                .subtitle { color: var(--text-secondary); font-size: 1.1rem; }
                .disclaimer-warning { font-family: var(--font-body); font-size: 0.8rem; color: var(--text-secondary); max-width: 400px; margin-top: -8px; line-height: 1.4; }
                h2 { margin-top: 20px; font-family: var(--font-heading); font-weight: 500;}
                .class-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-top: 16px; width: 100%; max-width: 600px; }
                .class-button { background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); padding: 12px 20px; border-radius: 12px; cursor: pointer; font-size: 1rem; font-family: var(--font-heading); font-weight: 500; position: relative; overflow: hidden; z-index: 1; transition: color 0.4s ease, border-color 0.4s ease, box-shadow 0.4s ease; }
                .creator-credit { position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); font-size: 0.75rem; color: var(--text-secondary); white-space: nowrap; }

                /* === Main Layout === */
                .app-container { display: flex; height: 100vh; }
                .sidebar { width: 260px; background-color: var(--bg-secondary); padding: 24px; display: flex; flex-direction: column; border-right: 1px solid var(--border-color); transition: transform 0.3s ease; transform: translateX(0); }
                .chat-main { flex: 1; display: flex; flex-direction: column; position: relative; background-color: var(--bg-primary); }
                
                /* === Sidebar === */
                .sidebar-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
                .sidebar-header .logo-container { position: relative; z-index: 1; overflow: hidden; border-radius: 50%; padding: 4px; }
                .sidebar-title { 
                    font-family: var(--font-heading); 
                    font-size: 1.5rem; 
                    transition: transform 0.3s ease-in-out;
                    transform-origin: left center;
                }
                .sidebar-school { font-size: 0.9rem; color: var(--text-secondary); }
                .sidebar-btn { width: 100%; padding: 12px; background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 12px; cursor: pointer; font-size: 0.9rem; text-align: left; display: flex; align-items: center; justify-content: flex-start; gap: 8px; font-family: var(--font-heading); font-weight: 500; position: relative; z-index: 1; overflow: hidden; transition: color 0.4s ease, border-color 0.4s ease, box-shadow 0.4s ease; }
                .sidebar-btn:disabled { background-color: var(--bg-tertiary); color: var(--text-secondary); cursor: not-allowed; opacity: 0.6; }
                .sidebar-btn:disabled:hover { color: var(--text-secondary); border-color: var(--border-color); box-shadow: none; }
                .sidebar-btn:disabled:hover::before { opacity: 0; }
                .sidebar-content { display: flex; flex-direction: column; gap: 12px; flex-grow: 1; overflow: hidden; }
                .chat-history-container { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; margin-top: 16px; padding-right: 8px; }
                .history-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-radius: 12px; cursor: pointer; transition: background-color 0.2s; }
                .history-item:hover { background-color: var(--bg-tertiary); }
                .history-item.active { background-color: var(--accent-primary); color: var(--bg-primary); }
                .history-item span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.9rem; }
                .history-delete-btn { background: none; border: none; color: var(--text-secondary); cursor: pointer; opacity: 0; transition: opacity 0.2s; }
                .history-item:hover .history-delete-btn { opacity: 1; }
                .history-item.active .history-delete-btn { color: var(--bg-primary); }
                .sidebar-footer { margin-top: auto; display: flex; flex-direction: column; gap: 16px; }
                .theme-toggle { display: flex; justify-content: space-between; align-items: center; padding: 8px; background-color: var(--bg-tertiary); border-radius: 999px; }
                .theme-toggle > span { text-transform: uppercase; font-size: 0.75rem; color: var(--text-secondary); font-weight: 700; letter-spacing: 0.5px; padding-left: 12px; }
                .switch { position: relative; display: inline-block; width: 40px; height: 22px; }
                .switch input { opacity: 0; width: 0; height: 0; }
                .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--bg-tertiary); border: 1px solid var(--border-color); transition: .4s; border-radius: 22px; }
                .slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: var(--text-secondary); transition: .4s; border-radius: 50%; }
                input:checked + .slider { background-color: var(--accent-primary); border-color: var(--accent-primary); }
                [data-theme='dark'] input:checked + .slider:before { background-color: var(--bg-primary); }
                input:checked + .slider:before { transform: translateX(18px); }

                /* === Futuristic Hover Effects === */
                 .sidebar-header:hover .sidebar-title {
                    transform: scale(1.05);
                }
                .sidebar-header .logo-container::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: var(--gemini-gradient);
                    background-size: 200% 200%;
                    z-index: -1;
                    opacity: 0;
                    transition: opacity 0.4s ease-in-out;
                }
                .sidebar-header .logo-container:hover::before {
                    opacity: 1;
                    animation: gradient-flow 4s linear infinite;
                }
                .sidebar-header .logo-container:hover svg {
                    stroke: white;
                    transition: stroke 0.4s ease;
                }
                [data-theme='dark'] .sidebar-header .logo-container:hover svg { stroke: var(--bg-primary); }

                .class-button::before, .sidebar-btn::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: var(--gemini-gradient);
                    z-index: -1;
                    opacity: 0;
                    transition: opacity 0.4s ease-out;
                }
                .class-button:hover, .sidebar-btn:hover {
                    color: #fff;
                    border-color: transparent;
                    box-shadow: 0 -6px 20px -5px rgba(249, 119, 33, 0.7), 0 6px 20px -5px rgba(45, 121, 199, 0.7);
                }
                [data-theme='dark'] .class-button:hover, [data-theme='dark'] .sidebar-btn:hover {
                    color: #fff;
                }
                .class-button:hover::before, .sidebar-btn:hover::before {
                    opacity: 1;
                }

                /* === Chat Area === */
                .chat-header { display: none; padding: 12px; border-bottom: 1px solid var(--border-color); align-items: center; gap: 12px;}
                .menu-btn { background: none; border: none; color: var(--text-primary); cursor: pointer; padding: 8px; }
                .chat-area { flex: 1; overflow-y: auto; padding: 24px 40px; }
                .chat-message { display: flex; gap: 16px; margin-bottom: 24px; width: 100%; }
                .role-model { max-width: 80%; }
                .role-user { justify-content: flex-end; }
                .message-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--bg-tertiary); display: flex; justify-content: center; align-items: center; font-weight: bold; flex-shrink: 0; align-self: flex-start; }
                .message-content-wrapper { display: flex; align-items: flex-start; gap: 8px; width: 100%; }
                .role-user .message-content-wrapper { justify-content: flex-end; }
                .message-content { line-height: 1.6; flex-grow: 1; overflow: hidden; font-family: 'Google Sans', sans-serif; }
                .role-model .message-content { font-size: 1rem; font-weight: 400; }
                .role-user .message-content { font-size: 21px; font-weight: 400; text-align: right; max-width: 80%; }
                .message-content p { margin-bottom: 1em; }
                .message-content ol, .message-content ul { padding-left: 20px; margin-bottom: 1em; text-align: left; }
                .message-content pre { background-color: var(--bg-secondary); padding: 16px; border-radius: 12px; overflow-x: auto; margin: 12px 0; font-family: 'Courier New', Courier, monospace; white-space: pre-wrap; word-wrap: break-word; text-align: left; }
                .message-content code:not(pre > code) { background-color: var(--bg-tertiary); padding: 2px 4px; border-radius: 6px; font-family: 'Courier New', Courier, monospace; }
                .message-image { max-width: 300px; border-radius: 12px; margin-bottom: 8px; }
                .copy-btn { background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; border-radius: 4px; transition: color 0.2s, background-color 0.2s; visibility: hidden; opacity: 0; }
                .chat-message:hover .copy-btn { visibility: visible; opacity: 1; }
                .copy-btn:hover { background-color: var(--bg-tertiary); color: var(--text-primary); }
                .message-sources { font-size: 0.9rem; margin-top: 16px; color: var(--text-secondary); text-align: left; }
                .message-sources hr { border: none; border-top: 1px solid var(--border-color); margin: 12px 0; }
                .message-sources p { font-weight: 500; color: var(--text-primary); margin-bottom: 8px;}
                .message-sources ol { padding-left: 18px; margin: 0; display: flex; flex-direction: column; gap: 8px; }
                .message-sources a { color: var(--text-primary); text-decoration: underline; }

                /* Chat Welcome Screen */
                .chat-welcome-screen { display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; text-align: center; animation: fadeIn 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94); }
                .chat-welcome-screen h1 { font-family: 'Google Sans', sans-serif; font-size: 5rem; font-weight: 500; }
                .welcome-hi { font-weight: 400; }
                .chat-welcome-screen p { margin-top: 8px; font-size: 1.1rem; color: var(--text-secondary); max-width: 400px; }
                .chat-welcome-screen .prompt-suggestions { margin-top: 32px; display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; max-width: 700px; }
                
                /* Typing Indicator */
                .typing-indicator {
                    font-family: 'Google Sans', sans-serif;
                    font-size: 18px;
                    color: var(--text-secondary);
                    padding: 4px 0;
                }

                /* === Input Area === */
                .input-area-container { padding: 12px 40px 24px; background-color: var(--bg-primary); border-top: 1px solid var(--border-color); }
                .input-area { max-width: 800px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
                .suggestion-btn { background-color: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); padding: 10px 18px; border-radius: 12px; cursor: pointer; font-size: 1rem; transition: all 0.2s; font-family: var(--font-heading); }
                .suggestion-btn:hover { background-color: var(--accent-primary); color: var(--bg-primary); border-color: var(--accent-primary); }
                .input-form { display: flex; align-items: center; position: relative; background-color: var(--bg-secondary); border-radius: 16px; border: 1px solid var(--border-color); transition: border-color 0.2s; }
                .input-form:focus-within { border-color: var(--text-primary); }
                .chat-input { width: 100%; padding: 14px 130px 14px 50px; border: none; background: transparent; color: var(--text-primary); font-size: 1rem; font-family: var(--font-heading); }
                .chat-input:focus { outline: none; }
                .input-btn { position: absolute; background: none; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer; display: flex; justify-content: center; align-items: center; color: var(--text-secondary); transition: all 0.2s; }
                .input-btn:hover { color: var(--text-primary); background-color: var(--bg-tertiary); }
                .upload-btn { left: 8px; }
                .voice-btn { right: 52px; }
                .voice-btn.recording { color: #e53935; }
                .send-btn { right: 8px; background-color: var(--accent-primary); color: var(--bg-primary); }
                .send-btn:hover { opacity: 0.8; }
                .send-btn:disabled { background-color: var(--text-secondary); cursor: not-allowed; opacity: 0.7; }
                .image-preview { position: relative; width: fit-content; }
                .image-preview img { max-height: 80px; border-radius: 12px; border: 1px solid var(--border-color); }
                .remove-image-btn { position: absolute; top: -8px; right: -8px; background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 50%; width: 20px; height: 20px; cursor: pointer; display: flex; justify-content: center; align-items: center; font-size: 12px; line-height: 1; }
                .input-options { display: flex; justify-content: space-between; align-items: center; }
                .search-toggle { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; color: var(--text-secondary); cursor: pointer; }
                .search-toggle .switch { transform: scale(0.8); }
                .search-toggle.disabled { opacity: 0.5; cursor: not-allowed; }

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
                }
            `}</style>

            <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <div className="logo-container"><BHSLogo /></div>
                    <div>
                        <h1 className="sidebar-title">bhsAI</h1>
                        <p className="sidebar-school">Birla High School</p>
                    </div>
                </div>
                <div className="sidebar-content">
                    <button className="sidebar-btn" onClick={() => handleNewChat()} disabled={!selectedClass}>
                        <Icon path="M12 5v14m-7-7h14" size={16} /> New Chat
                    </button>
                    <div className="chat-history-container">
                        {selectedClass && Object.entries(chatHistories[selectedClass] || {}).map(([chatId, messages]) => (
                             <div key={chatId} className={`history-item ${chatId === activeChatId ? 'active' : ''}`} onClick={() => handleSelectChat(chatId)}>
                                <span>{messages[0]?.text.substring(0, 25) || 'New Chat...'}</span>
                                <button className="history-delete-btn" onClick={(e) => { e.stopPropagation(); handleDeleteChat(chatId); }} aria-label="Delete chat">
                                    <Icon path="M18 6L6 18M6 6l12 12" size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                    <hr style={{borderColor: 'var(--border-color)', opacity: 0.5, margin: '16px 0'}}/>
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

                <div className="chat-area">
                    {selectedClass === null ? <InitialClassSelector /> :
                     currentMessages.length === 0 ? <ChatWelcomeScreen /> :
                        (<>
                            {currentMessages.map((msg, index) => <Message key={index} msg={msg} index={index}/>)}
                            <div ref={chatEndRef} />
                        </>
                    )}
                </div>

                {selectedClass !== null && (
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

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);