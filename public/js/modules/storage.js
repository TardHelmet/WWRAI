/**
 * Storage Manager Module
 * Handles all localStorage operations with a migration path to IndexedDB
 */

class StorageManager {
    constructor() {
        this.prefix = 'storyforge_';
    }

    /**
     * Save data to localStorage with optional namespacing
     * @param {string} key - The storage key
     * @param {any} data - The data to store (will be JSON stringified)
     */
    save(key, data) {
        try {
            const fullKey = this.prefix + key;
            const serialized = JSON.stringify(data);
            localStorage.setItem(fullKey, serialized);
            return true;
        } catch (error) {
            console.warn(`Failed to save ${key} to storage:`, error);
            // Emit storage error event for UI feedback
            this.emitStorageError(error);
            return false;
        }
    }

    /**
     * Load data from localStorage
     * @param {string} key - The storage key
     * @returns {any} The deserialized data or null if not found
     */
    load(key) {
        try {
            const fullKey = this.prefix + key;
            const data = localStorage.getItem(fullKey);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.warn(`Failed to load ${key} from storage:`, error);
            return null;
        }
    }

    /**
     * Remove data from localStorage
     * @param {string} key - The storage key
     */
    remove(key) {
        try {
            const fullKey = this.prefix + key;
            localStorage.removeItem(fullKey);
            return true;
        } catch (error) {
            console.warn(`Failed to remove ${key} from storage:`, error);
            return false;
        }
    }

    /**
     * Clear all StoryForge data from localStorage
     */
    clear() {
        try {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith(this.prefix)) {
                    localStorage.removeItem(key);
                }
            });
            return true;
        } catch (error) {
            console.warn('Failed to clear storage:', error);
            return false;
        }
    }

    /**
     * Get storage usage info
     * @returns {object} Storage usage information
     */
    getUsageInfo() {
        const keys = Object.keys(localStorage);
        const storyForgeKeys = keys.filter(key => key.startsWith(this.prefix));
        let totalSize = 0;
        
        storyForgeKeys.forEach(key => {
            const item = localStorage.getItem(key);
            totalSize += item ? item.length : 0;
        });

        return {
            itemCount: storyForgeKeys.length,
            approximateSizeKB: Math.round(totalSize / 1024),
            isNearLimit: totalSize > 4 * 1024 * 1024 // 4MB warning threshold
        };
    }

    /**
     * Story-specific operations
     */

    /**
     * Save a story to the library
     * @param {object} story - Story object with title, originalStory, finalStory
     * @returns {object} The saved story with ID and timestamp
     */
    saveStory(story) {
        const stories = this.load('stories') || [];
        const newStory = {
            id: Date.now().toString(),
            ...story,
            createdAt: new Date().toISOString()
        };
        stories.unshift(newStory);
        this.save('stories', stories);
        return newStory;
    }

    /**
     * Load all stories from library
     * @returns {array} Array of story objects
     */
    loadStories() {
        return this.load('stories') || [];
    }

    /**
     * Get a specific story by ID
     * @param {string} storyId - The story ID
     * @returns {object|null} The story or null if not found
     */
    getStory(storyId) {
        const stories = this.loadStories();
        return stories.find(s => s.id === storyId) || null;
    }

    /**
     * Delete a story by ID
     * @param {string} storyId - The story ID
     * @returns {boolean} Success status
     */
    deleteStory(storyId) {
        const stories = this.loadStories();
        const filtered = stories.filter(s => s.id !== storyId);
        this.save('stories', filtered);
        return true;
    }

    /**
     * Clear all stories
     * @returns {boolean} Success status
     */
    clearStories() {
        return this.remove('stories');
    }

    /**
     * User progress operations
     */

    /**
     * Save user progress
     * @param {object} progress - User progress object
     */
    saveProgress(progress) {
        return this.save('userProgress', progress);
    }

    /**
     * Load user progress
     * @returns {object|null} User progress or default
     */
    loadProgress() {
        return this.load('userProgress') || {
            xp: 0,
            level: 1,
            totalWords: 0,
            storiesCompleted: 0,
            segmentsCompleted: 0
        };
    }

    /**
     * Draft operations for auto-save
     */

    /**
     * Save current draft
     * @param {string} content - The draft content
     * @param {string} videoId - Optional video ID
     */
    saveDraft(content, videoId = null) {
        const draft = {
            content: content,
            timestamp: new Date().toISOString(),
            videoId: videoId
        };
        return this.save('currentDraft', draft);
    }

    /**
     * Load current draft
     * @returns {object|null} Draft object or null
     */
    loadDraft() {
        return this.load('currentDraft');
    }

    /**
     * Clear current draft
     * @returns {boolean} Success status
     */
    clearDraft() {
        return this.remove('currentDraft');
    }

    /**
     * User info operations
     */

    /**
     * Save user info
     * @param {object} user - User object (at minimum with username)
     */
    saveUser(user) {
        return this.save('user', user);
    }

    /**
     * Load user info
     * @returns {object|null} User object or null
     */
    loadUser() {
        return this.load('user');
    }

    /**
     * Error logging
     */

    /**
     * Save error for reporting
     * @param {object} errorData - Error information
     */
    logError(errorData) {
        const errors = this.load('errors') || [];
        errors.push(errorData);
        
        // Keep only last 50 errors to prevent storage bloat
        if (errors.length > 50) {
            errors.splice(0, errors.length - 50);
        }
        
        return this.save('errors', errors);
    }

    /**
     * Get all logged errors
     * @returns {array} Array of error objects
     */
    getErrors() {
        return this.load('errors') || [];
    }

    /**
     * Clear all logged errors
     * @returns {boolean} Success status
     */
    clearErrors() {
        return this.remove('errors');
    }

    /**
     * Event emission for storage issues
     */
    emitStorageError(error) {
        const event = new CustomEvent('storageError', {
            detail: { error }
        });
        window.dispatchEvent(event);
    }
}

// Export singleton instance
export default new StorageManager();
