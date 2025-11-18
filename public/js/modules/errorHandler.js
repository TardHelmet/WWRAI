/**
 * Error Handler Module
 * Manages error display, logging, and user feedback
 */

class ErrorHandler {
    constructor() {
        this.errors = [];
        this.maxStoredErrors = 50;
    }

    /**
     * Show error toast notification
     * @param {string} message - Error message to display
     * @param {object} options - Configuration options
     *   - retry: function to call when retry is clicked
     *   - duration: how long to show (ms), default 5000
     *   - type: 'error', 'warning', 'info'
     */
    static showError(message, options = {}) {
        const { retry, duration = 5000, type = 'error' } = options;
        
        const container = document.createElement('div');
        container.className = `error-toast error-${type}`;
        container.setAttribute('role', 'alert');
        container.setAttribute('aria-live', 'assertive');
        
        const content = `
            <div class="error-content">
                <span class="error-icon" aria-hidden="true">
                    ${type === 'error' ? '⚠️' : type === 'warning' ? '⚡' : 'ℹ️'}
                </span>
                <span class="error-message">${message}</span>
                ${retry ? '<button class="retry-btn" aria-label="Retry action">Retry</button>' : ''}
                <button class="close-btn" aria-label="Close error message">×</button>
            </div>
        `;
        
        container.innerHTML = content;
        document.body.appendChild(container);
        
        // Handle retry
        if (retry) {
            container.querySelector('.retry-btn').addEventListener('click', () => {
                container.remove();
                retry();
            });
        }
        
        // Handle close
        container.querySelector('.close-btn').addEventListener('click', () => {
            container.remove();
        });
        
        // Auto-dismiss
        const timeout = setTimeout(() => {
            if (container.parentElement) {
                container.remove();
            }
        }, duration);
        
        // Allow manual dismissal to clear timeout
        const clearTimeout_bound = () => clearTimeout(timeout);
        container.addEventListener('remove', clearTimeout_bound);
        
        return container;
    }

    /**
     * Show loading overlay with spinner and message
     * @param {string} message - Loading message
     * @param {object} options - Configuration options
     *   - cancellable: show cancel button, default false
     *   - onCancel: callback when cancelled
     * @returns {HTMLElement} Loader element for later removal
     */
    static showLoading(message = 'Loading...', options = {}) {
        const { cancellable = false, onCancel = null } = options;
        
        const loader = document.createElement('div');
        loader.id = 'global-loader';
        loader.className = 'loading-overlay';
        loader.setAttribute('role', 'progressbar');
        loader.setAttribute('aria-label', message);
        
        let content = `
            <div class="loading-container">
                <div class="loading-spinner" aria-hidden="true"></div>
                <div class="loading-message">${message}</div>
        `;
        
        if (cancellable) {
            content += '<button class="cancel-btn" aria-label="Cancel loading">Cancel</button>';
        }
        
        content += '</div>';
        loader.innerHTML = content;
        document.body.appendChild(loader);
        
        // Handle cancel
        if (cancellable && onCancel) {
            loader.querySelector('.cancel-btn').addEventListener('click', () => {
                this.hideLoading();
                onCancel();
            });
        }
        
        return loader;
    }

    /**
     * Hide loading overlay
     */
    static hideLoading() {
        const loader = document.getElementById('global-loader');
        if (loader) {
            loader.remove();
        }
    }

    /**
     * Update loading message (if visible)
     * @param {string} message - New message
     */
    static updateLoadingMessage(message) {
        const loader = document.getElementById('global-loader');
        if (loader) {
            const messageEl = loader.querySelector('.loading-message');
            if (messageEl) {
                messageEl.textContent = message;
            }
        }
    }

    /**
     * Show progress loading (for multi-step processes)
     * @param {string} message - Loading message
     * @param {number} current - Current step
     * @param {number} total - Total steps
     */
    static showProgress(message = 'Loading...', current = 1, total = 1) {
        const percentage = Math.round((current / total) * 100);
        
        let loader = document.getElementById('global-loader');
        
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'global-loader';
            loader.className = 'loading-overlay';
            document.body.appendChild(loader);
        }
        
        loader.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner" aria-hidden="true"></div>
                <div class="loading-message">${message}</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${percentage}%"></div>
                </div>
                <div class="progress-text">${current} of ${total}</div>
            </div>
        `;
        
        loader.setAttribute('role', 'progressbar');
        loader.setAttribute('aria-valuenow', percentage);
        loader.setAttribute('aria-valuemin', 0);
        loader.setAttribute('aria-valuemax', 100);
        loader.setAttribute('aria-label', message);
    }

    /**
     * Log error with optional context
     * @param {Error} error - The error object
     * @param {string} context - Context/location of error
     * @param {object} userData - Additional user data
     */
    static async logError(error, context = '', userData = {}) {
        const errorData = {
            message: error?.message || 'Unknown error',
            stack: error?.stack || '',
            context: context,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href,
            isOnline: navigator.onLine,
            ...userData
        };
        
        console.error('🚨 Error logged:', errorData);
        
        // Store locally
        try {
            const errors = JSON.parse(localStorage.getItem('storyforge_errors') || '[]');
            errors.push(errorData);
            
            // Keep only last 50 errors
            if (errors.length > this.maxStoredErrors) {
                errors.splice(0, errors.length - this.maxStoredErrors);
            }
            
            localStorage.setItem('storyforge_errors', JSON.stringify(errors));
        } catch (storageError) {
            console.warn('Could not store error locally:', storageError);
        }
        
        // Send to server for production monitoring
        if (navigator.onLine && typeof fetch !== 'undefined') {
            try {
                await fetch('/api/analytics/error', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(errorData)
                }).catch(() => {}); // Silently fail
            } catch (e) {
                console.warn('Could not send error to server');
            }
        }
    }

    /**
     * Set up global error handlers
     */
    static setupGlobalHandlers() {
        // Unhandled errors
        window.addEventListener('error', (event) => {
            this.logError(
                event.error || new Error(event.message),
                'Global error handler',
                { filename: event.filename, lineno: event.lineno }
            );
        });

        // Unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.logError(
                new Error(event.reason),
                'Unhandled promise rejection'
            );
        });

        // Storage errors
        window.addEventListener('storageError', (event) => {
            this.showError(
                'Storage is full. Some data may not be saved.',
                { type: 'warning' }
            );
        });
    }

    /**
     * Create a user-friendly error message from technical error
     * @param {Error} error - The error
     * @returns {string} User-friendly message
     */
    static getReadableMessage(error) {
        const message = error?.message || '';
        
        if (message.includes('network') || message.includes('fetch')) {
            return 'Connection error. Please check your internet and try again.';
        } else if (message.includes('timeout')) {
            return 'Request timed out. Please try again.';
        } else if (message.includes('rate limit') || message.includes('429')) {
            return 'Too many requests. Please wait a moment before trying again.';
        } else if (message.includes('API key') || message.includes('401')) {
            return 'Authentication error. Please try again.';
        } else if (message.includes('quota')) {
            return 'Service quota exceeded. Please try again later.';
        } else if (message.includes('storage')) {
            return 'Storage is full. Please clear some space and try again.';
        }
        
        return 'Something went wrong. Please try again.';
    }

    /**
     * Wrap async function with error handling
     * @param {function} fn - The async function
     * @param {string} context - Error context
     * @param {object} options - Options (showError, showLoading, etc)
     * @returns {function} Wrapped function
     */
    static wrapAsync(fn, context = '', options = {}) {
        return async (...args) => {
            const { 
                showError = true, 
                showLoading = false, 
                loadingMessage = 'Loading...',
                retryable = true
            } = options;
            
            let loader = null;
            
            try {
                if (showLoading) {
                    loader = this.showLoading(loadingMessage);
                }
                
                return await fn(...args);
            } catch (error) {
                this.logError(error, context);
                
                if (showError) {
                    const message = this.getReadableMessage(error);
                    this.showError(message, {
                        retry: retryable ? () => this.wrapAsync(fn, context, options)(...args) : null
                    });
                }
                
                throw error;
            } finally {
                if (loader && document.body.contains(loader)) {
                    this.hideLoading();
                }
            }
        };
    }
}

// Set up global error handlers on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        ErrorHandler.setupGlobalHandlers();
    });
} else {
    ErrorHandler.setupGlobalHandlers();
}

export default ErrorHandler;
