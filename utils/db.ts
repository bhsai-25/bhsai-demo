

import type { StoredChat } from '../types';

let db: IDBDatabase;

const DB_NAME = 'QuestionnaireDB';
const DB_VERSION = 1; // Reverted to original version
const CHAT_STORE_NAME = 'chats';

export const initDB = (): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        if (db) {
            return resolve(true);
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const dbInstance = (event.target as IDBOpenDBRequest).result;
            // This will only run for first-time users or if the DB doesn't exist.
            if (!dbInstance.objectStoreNames.contains(CHAT_STORE_NAME)) {
                const store = dbInstance.createObjectStore(CHAT_STORE_NAME, { keyPath: 'id' });
                store.createIndex('classNum', 'classNum', { unique: false });
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
        const newChat = { ...chat, createdAt: Date.now(), isPinned: false };
        
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
        if (!store.indexNames.contains('classNum')) {
             console.error("Index 'classNum' not found. DB might be in an inconsistent state.");
             return resolve([]);
        }
        const index = store.index('classNum');
        const range = IDBKeyRange.only(classNum);
        const request = index.getAll(range);

        request.onsuccess = () => {
            // Sort by pinned status first (pinned on top), then by creation date (newest first)
            const sortedChats = request.result.sort((a, b) => {
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;
                return b.createdAt - a.createdAt;
            });
            resolve(sortedChats);
        };
        request.onerror = () => reject(request.error);
    });
};