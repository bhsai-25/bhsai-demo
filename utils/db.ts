
import type { StoredChat } from '../types';

let db: IDBDatabase;

const DB_NAME = 'bhsAIDB';
const DB_VERSION = 1;
const CHAT_STORE_NAME = 'chats';

export const initDB = (): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        if (db) {
            return resolve(true);
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const dbInstance = (event.target as IDBOpenDBRequest).result;
            if (!dbInstance.objectStoreNames.contains(CHAT_STORE_NAME)) {
                const store = dbInstance.createObjectStore(CHAT_STORE_NAME, { keyPath: 'id' });
                store.createIndex('classNum_createdAt', ['classNum', 'createdAt']);
                store.createIndex('classNum', 'classNum');
            }
        };

        request.onsuccess = (event) => {
            db = (event.target as IDBOpenDBRequest).result;
            resolve(true);
        };

        request.onerror = (event) => {
            console.error('IndexedDB error:', (event.target as IDBOpenDBRequest).error);
            reject(false);
        };
    });
};

export const addChat = (chat: Omit<StoredChat, 'createdAt'>): Promise<StoredChat> => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(CHAT_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(CHAT_STORE_NAME);
        const newChat = { ...chat, createdAt: Date.now() };
        
        const request = store.add(newChat);

        request.onsuccess = () => resolve(newChat);
        request.onerror = () => reject(request.error);
    });
};

export const updateChat = (chat: StoredChat): Promise<StoredChat> => {
     return new Promise((resolve, reject) => {
        const transaction = db.transaction(CHAT_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(CHAT_STORE_NAME);
        const request = store.put(chat);

        request.onsuccess = () => resolve(chat);
        request.onerror = () => reject(request.error);
    });
};

export const deleteChat = (id: string): Promise<void> => {
     return new Promise((resolve, reject) => {
        const transaction = db.transaction(CHAT_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(CHAT_STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const getChatsForClass = (classNum: number): Promise<StoredChat[]> => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(CHAT_STORE_NAME, 'readonly');
        const store = transaction.objectStore(CHAT_STORE_NAME);
        const index = store.index('classNum_createdAt');
        const range = IDBKeyRange.bound([classNum, -Infinity], [classNum, Infinity]);
        const request = index.getAll(range);

        request.onsuccess = () => {
            // Sort descending by createdAt
            const sortedChats = request.result.sort((a, b) => b.createdAt - a.createdAt);
            resolve(sortedChats);
        };
        request.onerror = () => reject(request.error);
    });
};

export const migrateFromLocalStorage = async (): Promise<void> => {
    const saved = localStorage.getItem('chatHistories');
    if (!saved) return;

    console.log("Found localStorage data, attempting migration...");
    const parsed = JSON.parse(saved);

    const tx = db.transaction(CHAT_STORE_NAME, 'readonly');
    const store = tx.objectStore(CHAT_STORE_NAME);
    const countRequest = store.count();
    
    return new Promise<void>(resolve => {
        countRequest.onsuccess = () => {
            if (countRequest.result > 0) {
                console.log("IndexedDB already has data. Skipping migration.");
                localStorage.removeItem('chatHistories');
                resolve();
                return;
            }

            const writeTx = db.transaction(CHAT_STORE_NAME, 'readwrite');
            const writeStore = writeTx.objectStore(CHAT_STORE_NAME);
            let chatCount = 0;
            
            for (const classNumStr in parsed) {
                const classNum = parseInt(classNumStr, 10);
                const chatsForClass = parsed[classNumStr];
                for (const chatId in chatsForClass) {
                    const chatData = chatsForClass[chatId];
                    const isOldFormat = Array.isArray(chatData);
                    const newChat: StoredChat = {
                        id: chatId,
                        classNum: classNum,
                        title: isOldFormat ? '' : chatData.title,
                        messages: isOldFormat ? chatData : chatData.messages,
                        createdAt: parseInt(chatId, 10) || Date.now()
                    };
                    writeStore.add(newChat);
                    chatCount++;
                }
            }

            writeTx.oncomplete = () => {
                console.log(`Successfully migrated ${chatCount} chats.`);
                localStorage.removeItem('chatHistories');
                localStorage.removeItem('activeChatIds');
                resolve();
            };
            writeTx.onerror = () => {
                console.error("Migration failed:", writeTx.error);
                resolve();
            };
        };
        countRequest.onerror = () => {
            console.error("Could not count items for migration check.");
            resolve();
        };
    });
};
