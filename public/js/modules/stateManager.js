/**
 * State Manager Module
 * Centralized state management with history tracking and subscribers
 */

class StateManager {
    constructor() {
        this.state = {
            currentUser: '',
            currentStory: '',
            currentRevision: 0,
            currentPage: 'welcomePage',
            videoWriting: {
                isActive: false,
                selectedVideo: null,
                sections: [],
                currentSegment: 0
            },
            userProgress: {
                xp: 0,
                level: 1,
                totalWords: 0,
                storiesCompleted: 0,
                segmentsCompleted: 0
            }
        };
        
        this.subscribers = new Map();
        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 50; // Keep last 50 states for undo/redo
    }

    /**
     * Get state value by key or entire state
     * @param {string} key - Optional key to get specific state
     * @returns {any} State value or entire state object
     */
    get(key) {
        if (!key) return { ...this.state };
        
        // Support nested keys like 'videoWriting.sections'
        const keys = key.split('.');
        let value = this.state;
        
        for (const k of keys) {
            value = value?.[k];
        }
        
        return value;
    }

    /**
     * Update state with new values
     * @param {object} updates - Object with state updates
     */
    set(updates) {
        // Save current state to history
        this._saveToHistory();
        
        // Deep merge updates
        this.state = {
            ...this.state,
            ...updates
        };
        
        // Notify subscribers
        this._notifySubscribers(Object.keys(updates));
        
        // Persist to storage
        this._persist();
    }

    /**
     * Update nested state value
     * @param {string} path - Dot notation path (e.g., 'videoWriting.sections')
     * @param {any} value - New value
     */
    setNested(path, value) {
        this._saveToHistory();
        
        const keys = path.split('.');
        const lastKey = keys.pop();
        
        let target = this.state;
        for (const key of keys) {
            if (!target[key]) target[key] = {};
            target = target[key];
        }
        
        target[lastKey] = value;
        
        this._notifySubscribers(keys.length > 0 ? [keys[0]] : [lastKey]);
        this._persist();
    }

    /**
     * Subscribe to state changes
     * @param {string} key - State key to subscribe to
     * @param {function} callback - Callback function
     * @returns {function} Unsubscribe function
     */
    subscribe(key, callback) {
        if (!this.subscribers.has(key)) {
            this.subscribers.set(key, []);
        }
        
        const callbacks = this.subscribers.get(key);
        callbacks.push(callback);
        
        // Return unsubscribe function
        return () => {
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        };
    }

    /**
     * Undo last state change
     */
    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.state = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
            this._notifyAll();
        }
    }

    /**
     * Redo last undone change
     */
    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.state = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
            this._notifyAll();
        }
    }

    /**
     * Check if undo is available
     * @returns {boolean}
     */
    canUndo() {
        return this.historyIndex > 0;
    }

    /**
     * Check if redo is available
     * @returns {boolean}
     */
    canRedo() {
        return this.historyIndex < this.history.length - 1;
    }

    /**
     * Reset state to initial values
     */
    reset() {
        this._saveToHistory();
        
        this.state = {
            currentUser: this.state.currentUser, // Keep user
            currentStory: '',
            currentRevision: 0,
            currentPage: 'welcomePage',
            videoWriting: {
                isActive: false,
                selectedVideo: null,
                sections: [],
                currentSegment: 0
            },
            userProgress: this.state.userProgress // Keep progress
        };
        
        this._notifyAll();
        this._persist();
    }

    /**
     * Clear all state and history (use with caution)
     */
    clear() {
        this.state = {
            currentUser: '',
            currentStory: '',
            currentRevision: 0,
            currentPage: 'welcomePage',
            videoWriting: {
                isActive: false,
                selectedVideo: null,
                sections: [],
                currentSegment: 0
            },
            userProgress: {
                xp: 0,
                level: 1,
                totalWords: 0,
                storiesCompleted: 0,
                segmentsCompleted: 0
            }
        };
        
        this.history = [];
        this.historyIndex = -1;
        this._notifyAll();
        localStorage.removeItem('storyforge_state');
    }

    /**
     * Load state from storage
     */
    load() {
        try {
            const saved = localStorage.getItem('storyforge_state');
            if (saved) {
                const parsed = JSON.parse(saved);
                this.state = { ...this.state, ...parsed };
            }
        } catch (error) {
            console.warn('Could not load state from storage:', error);
        }
    }

    /**
     * Private: Save current state to history
     */
    _saveToHistory() {
        // Remove any redo states
        this.history = this.history.slice(0, this.historyIndex + 1);
        
        // Add new state
        this.history.push(JSON.parse(JSON.stringify(this.state)));
        this.historyIndex++;
        
        // Trim history if too large
        if (this.history.length > this.maxHistory) {
            this.history.shift();
            this.historyIndex--;
        }
    }

    /**
     * Private: Notify subscribers of changes
     */
    _notifySubscribers(changedKeys) {
        changedKeys.forEach(key => {
            const callbacks = this.subscribers.get(key) || [];
            callbacks.forEach(callback => {
                try {
                    callback(this.state[key]);
                } catch (error) {
                    console.error(`Error in subscriber for key "${key}":`, error);
                }
            });
        });
    }

    /**
     * Private: Notify all subscribers
     */
    _notifyAll() {
        this.subscribers.forEach((callbacks, key) => {
            callbacks.forEach(callback => {
                try {
                    callback(this.state[key]);
                } catch (error) {
                    console.error(`Error in subscriber for key "${key}":`, error);
                }
            });
        });
    }

    /**
     * Private: Persist state to localStorage
     */
    _persist() {
        try {
            localStorage.setItem('storyforge_state', JSON.stringify(this.state));
        } catch (error) {
            console.warn('Could not persist state:', error);
            // Emit event for storage issues
            const event = new CustomEvent('storageError', { detail: { error } });
            window.dispatchEvent(event);
        }
    }

    /**
     * Get state snapshot for debugging
     * @returns {object} Current state
     */
    snapshot() {
        return JSON.parse(JSON.stringify(this.state));
    }

    /**
     * Get history info for debugging
     * @returns {object} History information
     */
    getHistoryInfo() {
        return {
            current: this.historyIndex,
            total: this.history.length,
            canUndo: this.canUndo(),
            canRedo: this.canRedo()
        };
    }
}

// Export singleton instance
export default new StateManager();
