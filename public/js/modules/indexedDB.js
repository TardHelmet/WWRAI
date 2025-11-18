/**
 * IndexedDB Manager Module
 * Handles persistent storage of large data like illustrated book images
 * Falls back to localStorage for small data
 */

class IndexedDBManager {
    constructor(dbName = 'StoryForgeDB', version = 1) {
        this.dbName = dbName;
        this.version = version;
        this.db = null;
        this.isAvailable = !!window.indexedDB;
    }

    /**
     * Initialize IndexedDB
     * @returns {Promise<IDBDatabase>}
     */
    async init() {
        if (!this.isAvailable) {
            console.warn('IndexedDB not available, using localStorage fallback');
            return null;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                console.error('IndexedDB open error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ IndexedDB initialized');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create object stores
                if (!db.objectStoreNames.contains('stories')) {
                    db.createObjectStore('stories', { keyPath: 'id' });
                }

                if (!db.objectStoreNames.contains('illustrations')) {
                    db.createObjectStore('illustrations', { keyPath: 'storyId' });
                }

                if (!db.objectStoreNames.contains('cache')) {
                    db.createObjectStore('cache', { keyPath: 'key' });
                }

                console.log('✅ IndexedDB stores created');
            };
        });
    }

    /**
     * Check if IndexedDB is available
     * @returns {boolean}
     */
    isReady() {
        return this.isAvailable && this.db !== null;
    }

    /**
     * Save a story with metadata
     * @param {object} story - Story object
     * @returns {Promise<string>} Story ID
     */
    async saveStory(story) {
        if (!this.isReady()) {
            return this._localStorageFallback('saveStory', story);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['stories'], 'readwrite');
            const store = transaction.objectStore('stories');
            const request = store.put({
                ...story,
                savedAt: new Date().toISOString()
            });

            request.onsuccess = () => {
                console.log('✅ Story saved to IndexedDB:', story.id);
                resolve(story.id);
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get a story by ID
     * @param {string} storyId - Story ID
     * @returns {Promise<object|null>}
     */
    async getStory(storyId) {
        if (!this.isReady()) {
            return this._localStorageFallback('getStory', storyId);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['stories'], 'readonly');
            const store = transaction.objectStore('stories');
            const request = store.get(storyId);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all stories
     * @returns {Promise<array>}
     */
    async getAllStories() {
        if (!this.isReady()) {
            return this._localStorageFallback('getAllStories');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['stories'], 'readonly');
            const store = transaction.objectStore('stories');
            const request = store.getAll();

            request.onsuccess = () => {
                const stories = request.result || [];
                // Sort by savedAt descending
                stories.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
                resolve(stories);
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete a story
     * @param {string} storyId - Story ID
     * @returns {Promise<void>}
     */
    async deleteStory(storyId) {
        if (!this.isReady()) {
            return this._localStorageFallback('deleteStory', storyId);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['stories', 'illustrations'], 'readwrite');
            
            // Delete story
            const storyStore = transaction.objectStore('stories');
            storyStore.delete(storyId);

            // Delete associated illustrations
            const illStore = transaction.objectStore('illustrations');
            illStore.delete(storyId);

            transaction.oncomplete = () => {
                console.log('✅ Story deleted:', storyId);
                resolve();
            };

            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * Save illustrated book pages
     * @param {string} storyId - Story ID
     * @param {array} pages - Array of page objects with images
     * @returns {Promise<void>}
     */
    async saveIllustrations(storyId, pages) {
        if (!this.isReady()) {
            return this._localStorageFallback('saveIllustrations', storyId, pages);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['illustrations'], 'readwrite');
            const store = transaction.objectStore('illustrations');
            
            const request = store.put({
                storyId,
                pages,
                savedAt: new Date().toISOString(),
                pageCount: pages.length
            });

            request.onsuccess = () => {
                console.log(`✅ Illustrations saved for story ${storyId} (${pages.length} pages)`);
                resolve();
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get illustrated book pages
     * @param {string} storyId - Story ID
     * @returns {Promise<array|null>}
     */
    async getIllustrations(storyId) {
        if (!this.isReady()) {
            return this._localStorageFallback('getIllustrations', storyId);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['illustrations'], 'readonly');
            const store = transaction.objectStore('illustrations');
            const request = store.get(storyId);

            request.onsuccess = () => {
                const result = request.result;
                resolve(result?.pages || null);
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete illustrations for a story
     * @param {string} storyId - Story ID
     * @returns {Promise<void>}
     */
    async deleteIllustrations(storyId) {
        if (!this.isReady()) {
            return this._localStorageFallback('deleteIllustrations', storyId);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['illustrations'], 'readwrite');
            const store = transaction.objectStore('illustrations');
            const request = store.delete(storyId);

            request.onsuccess = () => {
                console.log('✅ Illustrations deleted:', storyId);
                resolve();
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Cache API responses
     * @param {string} key - Cache key
     * @param {any} data - Data to cache
     * @param {number} ttlSeconds - Time to live in seconds
     * @returns {Promise<void>}
     */
    async setCache(key, data, ttlSeconds = 3600) {
        if (!this.isReady()) {
            return this._localStorageFallback('setCache', key, data, ttlSeconds);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cache'], 'readwrite');
            const store = transaction.objectStore('cache');

            const request = store.put({
                key,
                data,
                expiresAt: Date.now() + (ttlSeconds * 1000),
                createdAt: Date.now()
            });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get cached data
     * @param {string} key - Cache key
     * @returns {Promise<any|null>}
     */
    async getCache(key) {
        if (!this.isReady()) {
            return this._localStorageFallback('getCache', key);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cache'], 'readonly');
            const store = transaction.objectStore('cache');
            const request = store.get(key);

            request.onsuccess = () => {
                const result = request.result;
                
                if (!result) {
                    resolve(null);
                    return;
                }

                // Check if expired
                if (result.expiresAt < Date.now()) {
                    // Delete expired entry
                    this.deleteCache(key).catch(console.warn);
                    resolve(null);
                } else {
                    resolve(result.data);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete cached data
     * @param {string} key - Cache key
     * @returns {Promise<void>}
     */
    async deleteCache(key) {
        if (!this.isReady()) {
            return this._localStorageFallback('deleteCache', key);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cache'], 'readwrite');
            const store = transaction.objectStore('cache');
            const request = store.delete(key);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear all cache
     * @returns {Promise<void>}
     */
    async clearCache() {
        if (!this.isReady()) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cache'], 'readwrite');
            const store = transaction.objectStore('cache');
            const request = store.clear();

            request.onsuccess = () => {
                console.log('✅ Cache cleared');
                resolve();
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get database size info
     * @returns {Promise<object>}
     */
    async getSizeInfo() {
        if (!navigator.storage?.estimate) {
            return {
                available: 'unknown',
                used: 'unknown',
                percentage: 'unknown'
            };
        }

        const estimate = await navigator.storage.estimate();
        const percentage = Math.round((estimate.usage / estimate.quota) * 100);

        return {
            used: this._formatBytes(estimate.usage),
            available: this._formatBytes(estimate.quota),
            usedBytes: estimate.usage,
            availableBytes: estimate.quota,
            percentage
        };
    }

    /**
     * Private: Fallback to localStorage for operations
     */
    _localStorageFallback(...args) {
        console.warn('IndexedDB not available, using localStorage fallback');
        // For now, just return null/empty
        // In production, implement actual localStorage logic
        return Promise.resolve(null);
    }

    /**
     * Private: Format bytes to human readable
     */
    _formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
}

// Create singleton instance
const idbManager = new IndexedDBManager();

// Initialize on module load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        idbManager.init().catch(error => {
            console.error('Failed to initialize IndexedDB:', error);
        });
    });
} else {
    idbManager.init().catch(error => {
        console.error('Failed to initialize IndexedDB:', error);
    });
}

export default idbManager;
