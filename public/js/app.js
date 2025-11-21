// Global state
let currentUser = '';
let currentStory = '';
let currentRevision = 0;
let maxRevisions = 4;
let currentGuildStory = '';
let guildRevisionCount = 0;
let maxGuildRevisions = 3;
let illustratedPages = [];
let currentPageIndex = 0;
let storyReaderInfo = {
    story: null,
    paragraphs: [],
    currentPage: 0
};
let selectedInspiration = '';
let selectedInspirationText = '';

// Video writing state
let selectedVideo = null;
let videoPlayer = null;
let videoWritingState = {
    isPlaying: false,
    currentSegment: 0,
    sections: [], // Array to store completed sections
    isVideoEnded: false,
    playbackTimer: null,
    autoSaveInterval: null,
    wordGoal: 25,
    estimatedTotalSegments: 0
};
let videoConfig = null;

// XP and Progress System
let userProgress = {
    xp: 0,
    level: 1,
    totalWords: 0,
    storiesCompleted: 0,
    segmentsCompleted: 0
};

// Page management
async function loadComponents() {
    const app = document.getElementById('app');
    const components = [
        'welcomePage', 'workshopPage', 'editorPage',
        'guildPage', 'successPage', 'illustratedBookPage', 'libraryPage',
        'newStoryOptionsPage', 'inspirationPage', 'storyReaderPage', 'videoWritingPage'
    ];

    for (const component of components) {
        const response = await fetch(`components/${component}.html`);
        const html = await response.text();
        app.innerHTML += html;
    }
}

// Video functionality
async function loadVideoConfig() {
    try {
        const response = await fetch('data/videoConfig.json');
        videoConfig = await response.json();
        return videoConfig;
    } catch (error) {
        console.error('Error loading video config:', error);
        // Fallback config
        return {
            videos: [
                { id: '_Td7JjCTfyc', title: 'Creative Inspiration Video 1' },
                { id: '_Td7JjCTfyc', title: 'Creative Inspiration Video 2' },
                { id: '_Td7JjCTfyc', title: 'Creative Inspiration Video 3' }
            ]
        };
    }
}

async function displayVideoOptions() {
    const container = document.getElementById('videoContainer');
    const config = await loadVideoConfig();
    
    container.innerHTML = '';
    
    // Handle both old and new config formats
    const videos = config.videos || [];
    const categories = config.categories || {};
    
    if (Object.keys(categories).length > 0) {
        // New category-based format
        Object.entries(categories).forEach(([categoryKey, category]) => {
            // Create category header
            const categoryHeader = document.createElement('div');
            categoryHeader.style.marginTop = '30px';
            categoryHeader.style.marginBottom = '16px';
            categoryHeader.innerHTML = `
                <h3 style="color: #1e40af; margin-bottom: 4px; font-size: 1.3rem;">${category.name}</h3>
                <p style="color: #6b7280; font-size: 0.9rem; margin: 0;">${category.description}</p>
            `;
            container.appendChild(categoryHeader);
            
            // Create video grid for this category
            const videoGrid = document.createElement('div');
            videoGrid.style.display = 'grid';
            videoGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(280px, 1fr))';
            videoGrid.style.gap = '16px';
            videoGrid.style.marginBottom = '20px';
            
            category.videos.forEach((video) => {
                const videoOption = document.createElement('div');
                videoOption.className = 'video-option';
                videoOption.innerHTML = `
                    <img src="https://img.youtube.com/vi/${video.id}/maxresdefault.jpg" 
                         alt="${video.title}" class="video-thumbnail">
                    <div class="video-title">${video.title}</div>
                `;
                
                videoOption.addEventListener('click', () => {
                    // Remove selection from other videos
                    document.querySelectorAll('.video-option').forEach(option => {
                        option.classList.remove('selected');
                    });
                    
                    // Select this video
                    videoOption.classList.add('selected');
                    selectedVideo = video;
                    
                    // Enable start button
                    const startButton = document.getElementById('startWithVideo');
                    startButton.disabled = false;
                });
                
                videoGrid.appendChild(videoOption);
            });
            
            container.appendChild(videoGrid);
        });
    } else if (videos.length > 0) {
        // Fallback to old flat format
        videos.forEach((video) => {
            const videoOption = document.createElement('div');
            videoOption.className = 'video-option';
            videoOption.innerHTML = `
                <img src="https://img.youtube.com/vi/${video.id}/maxresdefault.jpg" 
                     alt="${video.title}" class="video-thumbnail">
                <div class="video-title">${video.title}</div>
            `;
            
            videoOption.addEventListener('click', () => {
                // Remove selection from other videos
                document.querySelectorAll('.video-option').forEach(option => {
                    option.classList.remove('selected');
                });
                
                // Select this video
                videoOption.classList.add('selected');
                selectedVideo = video;
                
                // Enable start button
                const startButton = document.getElementById('startWithVideo');
                startButton.disabled = false;
            });
            
            container.appendChild(videoOption);
        });
    }
}

function initializeVideoPlayer(videoId) {
    return new Promise((resolve) => {
        // Load YouTube IFrame API if not already loaded
        if (!window.YT) {
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            
            window.onYouTubeIframeAPIReady = () => {
                createPlayer(videoId, resolve);
            };
        } else {
            createPlayer(videoId, resolve);
        }
    });
}

function createPlayer(videoId, resolve) {
    try {
        console.log('🎬 Creating YouTube player for video:', videoId);
        console.log('📍 Current origin:', window.location.origin);
        
        videoPlayer = new YT.Player('videoPlayer', {
            height: '100%',
            width: '100%',
            videoId: videoId,
            playerVars: {
                enablejsapi: 1,             // Enable JavaScript API - CRITICAL for cross-origin
                origin: window.location.origin,  // Fix cross-origin communication
                controls: 0,        // Hide controls
                disablekb: 1,       // Disable keyboard
                modestbranding: 1,  // Minimal YouTube branding
                rel: 0,             // No related videos
                showinfo: 0,        // No video info
                fs: 0,              // No fullscreen button
                iv_load_policy: 3,  // No annotations
                autoplay: 0,        // Don't autoplay
                start: 0            // Start from beginning
            },
            events: {
                onReady: (event) => {
                    console.log('✅ YouTube player ready');
                    resolve(event.target);
                },
                onStateChange: onPlayerStateChange,
                onError: (event) => {
                    console.error('❌ YouTube player error:', event.data);
                    logError(new Error(`YouTube player error: ${event.data}`), 'Player initialization');
                }
            }
        });
    } catch (error) {
        console.error('❌ Error creating YouTube player:', error);
        logError(error, 'Player creation');
        resolve(null);
    }
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.ENDED) {
        videoWritingState.isVideoEnded = true;
        // Pause the video and show final writing prompt
        pauseVideoAndPromptWriting();
    }
}

function startVideoWritingCycle() {
    videoWritingState.isPlaying = true;
    videoWritingState.currentSegment++;
    
    // Update UI
    document.getElementById('videoStatus').textContent = 'Playing...';
    document.getElementById('writingPrompt').textContent = 'Watch carefully...';
    document.getElementById('videoStoryText').disabled = true;
    document.getElementById('continueWatching').disabled = true;
    
    // Trigger slide animations
    const videoSection = document.getElementById('videoSection');
    const writingSection = document.getElementById('writingSection');
    
    // Remove any existing animation classes
    videoSection.classList.remove('slide-out-left', 'slide-in-left');
    writingSection.classList.remove('slide-out-right', 'slide-in-right', 'panel-hidden');
    
    // Slide writing section out to the right
    writingSection.classList.add('slide-out-right');
    
    // After animation completes, hide writing section and show video
    setTimeout(() => {
        writingSection.classList.add('panel-hidden');
        writingSection.classList.remove('slide-out-right');
        
        // Slide video in from left
        videoSection.classList.remove('panel-hidden');
        videoSection.classList.add('slide-in-left');
    }, 500);
    
    // Start playing video with autoplay
    videoPlayer.playVideo();
    
    // Set timer for 15 seconds
    videoWritingState.playbackTimer = setTimeout(() => {
        pauseVideoAndPromptWriting();
    }, 15000);
}

function pauseVideoAndPromptWriting() {
    videoPlayer.pauseVideo();
    videoWritingState.isPlaying = false;
    
    // Dynamic prompts based on segment and video state
    let promptText;
    let sectionText;
    let buttonText = 'Continue Watching';
    
    if (videoWritingState.isVideoEnded) {
        promptText = 'Finish your story';
        sectionText = 'Final Section';
        buttonText = 'Submit Your Story';
    } else if (videoWritingState.currentSegment === 1) {
        promptText = 'Now write what you saw';
        sectionText = 'Writing Section 1';
    } else {
        promptText = 'Continue writing the story you see';
        sectionText = `Writing Section ${videoWritingState.currentSegment}`;
    }
    
    // Update UI
    document.getElementById('videoStatus').textContent = videoWritingState.isVideoEnded ? 'Video complete!' : 'Paused - Time to write!';
    document.getElementById('writingPrompt').textContent = promptText;
    document.getElementById('sectionCount').textContent = sectionText;
    document.getElementById('continueWatching').textContent = buttonText;
    document.getElementById('videoStoryText').disabled = false;
    document.getElementById('continueWatching').disabled = true;
    
    // Display previous sections if any
    updatePreviousSectionsDisplay();
    
    // Clear textarea for new section input
    document.getElementById('videoStoryText').value = '';
    
    // Reset word count for new section
    document.getElementById('currentWordCount').textContent = '0';
    const progressBar = document.getElementById('wordGoalProgressBar');
    if (progressBar) {
        progressBar.style.width = '0%';
        progressBar.classList.remove('complete');
    }
    
    // Clear word goal status
    const wordGoalStatus = document.getElementById('wordGoalStatus');
    if (wordGoalStatus) {
        wordGoalStatus.textContent = '';
        wordGoalStatus.classList.remove('complete');
    }
    
    // Trigger slide animations
    const videoSection = document.getElementById('videoSection');
    const writingSection = document.getElementById('writingSection');
    
    // Remove any existing animation classes
    videoSection.classList.remove('slide-out-left', 'slide-in-left');
    writingSection.classList.remove('slide-out-right', 'slide-in-right', 'panel-hidden');
    
    // Slide video out to the left
    videoSection.classList.add('slide-out-left');
    
    // After animation completes, hide video and show writing section
    setTimeout(() => {
        videoSection.classList.add('panel-hidden');
        videoSection.classList.remove('slide-out-left');
        
        // Slide writing section in from right
        writingSection.classList.remove('panel-hidden');
        writingSection.classList.add('slide-in-right');
        
        // Focus on textarea after animation
        setTimeout(() => {
            document.getElementById('videoStoryText').focus();
            
            // Start auto-save
            startAutoSave();
        }, 500);
    }, 500);
}

function showFinalWritingPrompt() {
    document.getElementById('videoStatus').textContent = 'Video complete!';
    document.getElementById('writingPrompt').textContent = 'Finish your story';
    document.getElementById('continueWatching').textContent = 'Submit Your Story';
    document.getElementById('continueWatching').disabled = false;
    document.getElementById('writingSection').classList.remove('hidden');
    
    // Scroll to writing area
    document.getElementById('writingSection').scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
    });
}

function validateWritingInput() {
    const textarea = document.getElementById('videoStoryText');
    const currentText = textarea.value.trim();
    const wordCount = currentText.split(/\s+/).filter(word => word.length > 0).length;
    
    // Update word count display
    document.getElementById('currentWordCount').textContent = wordCount;
    
    // Enable continue button if minimum words written (at least 3 words)
    const continueButton = document.getElementById('continueWatching');
    if (wordCount >= 3) {
        continueButton.disabled = false;
    } else {
        continueButton.disabled = true;
    }
}

function continueVideoOrSubmit() {
    const textarea = document.getElementById('videoStoryText');
    const currentText = textarea.value.trim();
    
    if (videoWritingState.isVideoEnded) {
        // Submit the complete story
        submitVideoStory();
    } else {
        // Add current text to story and continue video
        if (currentText) {
            if (videoWritingState.storyText) {
                videoWritingState.storyText += '\n\n' + currentText;
            } else {
                videoWritingState.storyText = currentText;
            }
            
            // Update textarea with accumulated text
            textarea.value = videoWritingState.storyText;
        }
        
        // Continue video playback
        startVideoWritingCycle();
    }
}

function submitVideoStory() {
    const textarea = document.getElementById('videoStoryText');
    const finalStory = textarea.value.trim();
    
    if (!finalStory) {
        alert('Please write your story before submitting!');
        return;
    }
    
    // Set the story as current story and move to editor
    currentStory = finalStory;
    const editableStory = document.getElementById('editableStory');
    if (editableStory) {
        editableStory.value = finalStory;
    }
    
    // Reset video state
    resetVideoWritingState();
    
    // Move to editor page
    showPage('editorPage');
}

function resetVideoWritingState() {
    // Stop auto-save before resetting
    stopAutoSave();
    
    // Clear playback timer
    if (videoWritingState.playbackTimer) {
        clearTimeout(videoWritingState.playbackTimer);
    }
    
    // Stop video player
    if (videoPlayer) {
        videoPlayer.stopVideo();
    }
    
    // Reset state while preserving autoSaveInterval and wordGoal properties
    videoWritingState.isPlaying = false;
    videoWritingState.currentSegment = 0;
    videoWritingState.sections = [];
    videoWritingState.isVideoEnded = false;
    videoWritingState.playbackTimer = null;
    videoWritingState.estimatedTotalSegments = 0;
    // Keep autoSaveInterval and wordGoal intact
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    const page = document.getElementById(pageId);
    if (page) {
        page.classList.add('active');
    }
    
    // Update user names
    if (currentUser) {
        const userElements = document.querySelectorAll('#userName, #userNameLibrary');
        userElements.forEach(el => el.textContent = currentUser);
    }
}

// Helper function to format story text with proper paragraphs
function formatStoryText(text) {
    // Split by newlines and clean up
    const paragraphs = text.split('\n').filter(p => p.trim().length > 0);
    
    // If no natural breaks, try to split by periods followed by capital letters
    if (paragraphs.length === 1) {
        const sentences = text.split(/(?<=\.)\s+(?=[A-Z])/);
        const groupedParagraphs = [];
        for (let i = 0; i < sentences.length; i += 2) {
            const para = sentences.slice(i, i + 2).join(' ');
            if (para.trim()) groupedParagraphs.push(para.trim());
        }
        return groupedParagraphs;
    }
    
    return paragraphs.map(p => p.trim());
}

// Helper function to display story with proper formatting
function displayFormattedStory(containerId, storyText) {
    const container = document.getElementById(containerId);
    const paragraphs = formatStoryText(storyText);
    
    container.innerHTML = paragraphs.map(para => `<p>${para}</p>`).join('');
}

function typeWriter(element, text, speed = 8, paragraphSpeed = 50) {
    let i = 0;
    element.innerHTML = "";
    
    // Normalize paragraph breaks - replace multiple newlines with double newlines
    const normalizedText = text.replace(/\n{2,}/g, '\n\n');
    
    function type() {
        if (i < normalizedText.length) {
            if (normalizedText.charAt(i) === '\n') {
                // Check if this is a paragraph break (double newline)
                if (i + 1 < normalizedText.length && normalizedText.charAt(i + 1) === '\n') {
                    element.innerHTML += '<br><br>';
                    i++; // Skip the next newline
                } else {
                    element.innerHTML += ' '; // Single newline becomes space
                }
                setTimeout(type, paragraphSpeed);
            } else {
                element.innerHTML += normalizedText.charAt(i);
                setTimeout(type, speed);
            }
            i++;
            
            // Auto-scroll to bottom of container as text appears
            if (element.parentElement) {
                element.parentElement.scrollTop = element.parentElement.scrollHeight;
            }
        }
    }
    type();
}
function saveToStorage(key, data) {
    localStorage.setItem(`storyforge_${key}`, JSON.stringify(data));
}

function loadFromStorage(key) {
    const data = localStorage.getItem(`storyforge_${key}`);
    return data ? JSON.parse(data) : null;
}

function saveStoryToLibrary(title, originalStory, finalStory) {
    const stories = loadFromStorage('stories') || [];
    const newStory = {
        id: Date.now().toString(),
        title: title || 'Untitled Story',
        originalStory,
        finalStory,
        createdAt: new Date().toISOString()
    };
    stories.unshift(newStory);
    saveToStorage('stories', stories);
    return newStory;
}

// Response cache for reducing API calls
const responseCache = new Map();

// Helper function to generate cache key
function getCacheKey(userText, mode, context) {
    return `${mode}:${btoa(userText + context).substring(0, 50)}`;
}

// Helper function for exponential backoff retry
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (i < maxRetries - 1) {
                const delay = baseDelay * Math.pow(2, i) + Math.random() * 1000;
                console.log(`Retry ${i + 1} in ${Math.round(delay)}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError;
}

// AI API calls with caching and retry logic
async function callStoryForgeAI(userText, mode, context = '') {
    try {
        let prompt = '';
        if ((!userText || userText.trim() === '') && mode !== 'inspiration') {
            return "I can't provide feedback on an empty story. Please write something first!";
        }

        // Check cache first (except for inspiration, editor_feedback and editor_revision which should be fresh)
        if (mode !== 'inspiration' && mode !== 'editor_feedback' && mode !== 'editor_revision') {
            const cacheKey = getCacheKey(userText, mode, context);
            if (responseCache.has(cacheKey)) {
                console.log('Using cached response for', mode);
                return responseCache.get(cacheKey);
            }
        }
        
        if (mode === 'editor_feedback') {
            prompt = `You are an experienced, caring writing teacher working with a young writer in the StoryForge Guild. Your job is to provide detailed, educational feedback that focuses on story beats, spelling, and grammar while celebrating their creativity.

Their story: "${userText}"

Analyze this story thoroughly and return a JSON object with 6-8 detailed feedback items. Each item should be a comprehensive mini-lesson that teaches while encouraging.

Structure: 
{
  "type": "praise" | "grammar" | "spelling" | "story_beats" | "suggestion" | "question",
  "text": "Your detailed educational response (3-5 sentences minimum)",
  "quote": "Exact text from their story this refers to"
}

PRIORITY FOCUS AREAS:

**STORY BEATS IDENTIFICATION & PRAISE (2-3 items):**
- Identify and celebrate key plot points in their story (beginning, conflict, climax, resolution)
- Point out strong story moments, character decisions, or plot developments
- Be positive and encouraging about their storytelling choices
- Example: "I love how you started your story with the character finding the mysterious key - this is called a 'hook' and it immediately makes readers want to know what happens next! You've created a perfect story beat that draws us into the adventure."

**SPELLING ERRORS (1-2 items):**
- Count total spelling errors in the story
- Show 1-2 specific examples with corrections
- Explain the correct spelling and provide memory tips when helpful
- Example: "I found 3 spelling errors in your story. For example, you wrote 'recieve' but the correct spelling is 'receive' - remember the rule 'i before e except after c!' Fixing these small details will make your wonderful story even more polished."

**GRAMMAR ISSUES (1-2 items):**
- Identify specific grammar problems with corrections and explanations
- Focus on: capitalization, punctuation, run-on sentences, sentence fragments, subject-verb agreement, verb tenses
- Provide clear corrections and explain why the rule matters
- Example: "In your sentence 'The dragon was huge it breathed fire,' you have two complete thoughts that need separation. You can fix this by adding a period: 'The dragon was huge. It breathed fire.' This helps readers follow your ideas more clearly!"

**POSITIVE STORY ELEMENTS (1-2 items):**
- Celebrate creative choices, interesting characters, or engaging dialogue
- Point out what makes their story unique and engaging
- Connect their good instincts to broader writing concepts
- Example: "Your character's decision to help the lost puppy shows great character development - it tells us your main character is kind and brave. This kind of character action is what makes readers care about what happens next!"

**GENTLE SUGGESTIONS (1 item):**
- Offer one constructive suggestion to improve their storytelling
- Keep it simple and actionable
- Focus on story structure, character development, or descriptive details
- Example: "Consider adding a sentence about how your character felt when they saw the dragon - were they scared, excited, or curious? Adding emotions helps readers connect with your character even more!"

RESPONSE STYLE:
- Be enthusiastic and encouraging about their story beats and creativity
- Use their exact words and characters in examples
- Make each response feel like a celebration of their storytelling with gentle teaching
- Keep a warm, supportive tone throughout
- Be specific about what story elements work well and why
- Explain writing concepts in kid-friendly terms

Return only the JSON object with 6-8 educational feedback items focusing primarily on story beats, spelling, and grammar.`
        } else if (mode === 'editor_revision') {
            prompt = `You are a caring writing teacher reviewing the student's revised story.

Original story: "${context}"
Their revision: "${userText}"

Compare the two versions and provide personalized, encouraging feedback that:
- Acknowledges specific improvements they made (reference exact changes)
- Celebrates their effort in revising
- Points out what's working better now
- ${currentRevision >= maxRevisions - 1 ?
            'Since this is their final revision, be very encouraging and guide them toward completion with confidence in their work.' :
            'Provides gentle guidance for their next steps if needed.'}

Address them personally and make your feedback feel genuine and specific to their actual changes.

Respond with a JSON object with a "response" field containing your personalized feedback. For example:
{
  "response": "Wonderful work! I noticed you changed 'The dragon was big' to 'The enormous dragon towered over the village' - that gives us such a better picture! Your revision really shows me you're thinking about how to help readers visualize the scene."
}

Keep your response warm, specific, and under 100 words.`

        } else if (mode === 'guild_story') {
            prompt = `You are a Guild writer creating a 12-paragraph children's story based on the Intern's original idea.

Their story: "${userText}"

Write a complete children's story that:
1. Expands their core idea into a full narrative with exactly 12 paragraphs
2. Keeps their main characters and plot elements
3. Adds adventure, dialogue, and descriptive details
4. Has a clear beginning, middle, and satisfying ending
5. Uses simple, engaging language for 10-year-olds
6. Each paragraph should be 2-4 sentences long

Format your response with clear paragraph breaks. Start each paragraph on a new line.

Just write the story - no introduction or explanation needed.`

        } else if (mode === 'guild_feedback') {
            prompt = `You are the Guild writer rewriting your story based on the Intern's feedback.

Original story: "${context}"
Their feedback: "${userText}"

Rewrite the complete 12-paragraph children's story incorporating their suggestions:
1. Keep the same basic plot but improve based on their feedback
2. Make the changes they suggested while keeping it a complete story
3. Maintain 12 paragraphs, each 2-4 sentences
4. Use simple, engaging language for 10-year-olds
5. Format with clear paragraph breaks

Write the complete revised story - no explanation, just the new story.`

        } else if (mode === 'guild_feedback_response') {
            prompt = `You are the Guild writer responding to the Intern's feedback.

Their feedback: "${userText}"

Respond as the grateful Guild writer:
1. Thank them for their thoughtful feedback
2. Mention one specific thing you improved based on their suggestion
3. ${guildRevisionCount >= maxGuildRevisions - 1 ?
                'Say you think the story is now perfect with their help' :
                'Ask if they have any other suggestions'}
4. Keep it warm and appreciative, under 60 words
5. Sign as "Your Guild Writer"

This is just your response to their feedback, not the story itself.`
        } else if (mode === 'inspiration') {
            prompt = `You are the Inspiration a friendly dwarf in the StoryForge Guild.

Generate four unique and random story kickoff sentences for a young writer, each in a different genre:

1.  **Real World:** Example: "When Roger pulled up to the local Gas Station, he just wanted to get a soda. But what he saw happening inside would change his day forever."
2.  **Traditional Fantasy:** Example: "The Princess knew that only knights were allowed to go into the dark forest, but she had been secretly training for years to be the first to make it through."
3.  **Science Fiction:** Example: "A bright light blinded the captain of the USS Mcgillicuty as it passed Saturns third moon. There isn't supposed to be anyone out here, he thought to himself."
4.  **Absurdism:** Example: "The people of Spumonitown Always kept the Cherri-ites seperate from the rest, but today the basket of pistachios somehow ended up in their bakery."

Ensure each sentence is intriguing and sets up a fun story.

Format your response with each genre clearly labeled, followed by the sentence. For example:

**Real World:**
[Sentence here]

**Traditional Fantasy:**
[Sentence here]

**Science Fiction:**
[Sentence here]

**Absurdism:**
[Sentence here]

Just provide the four sentences with labels - no other conversational text.`
        } else if (mode === 'summarize_strengths') {
            prompt = `You are a caring, kind story-dwarf with a warm smile - an editor in the StoryForge Guild who celebrates young writers.

The young writer has decided they like their story as it is, and you need to provide a personalized summary of what makes THEIR specific story wonderful.

Their story: "${userText}"

Write a warm, personal response that:
- Points out specific elements from THEIR story that work well (mention actual characters, plot points, or phrases they used)
- Celebrates their unique voice and creativity
- Highlights what shows growth as a writer
- Makes them feel proud of what they've accomplished
- References specific moments or details from their actual story
- Encourages them to continue writing

Keep your tone warm and encouraging, like a friendly mentor celebrating their work. Address them as "Dear Young Writer" and sign as "Your friend, The Story-Dwarf". Make it feel personal and specific to their story, not generic praise.

Write in a conversational, caring tone that makes them excited about their writing journey.`
        }

        if (!prompt || prompt.trim() === '') {
            return "There was an issue generating the AI prompt. Please try again.";
        }

        // Use retry logic for API calls
        const result = await retryWithBackoff(async () => {
            const response = await fetch('/api/storyforge-ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                        temperature: 0.8,
                        maxOutputTokens: mode === 'guild_story' ? 1500 : 
                                       mode === 'editor_feedback' ? 1500 : 500
                    }
                })
            });

            if (!response.ok) {
                if (response.status >= 500 || response.status === 429) {
                    // Retry on server errors and rate limits
                    throw new Error(`Server error: ${response.status}`);
                } else {
                    // Don't retry on client errors
                    const errorText = await response.text();
                    throw new Error(`Client error: ${response.status} - ${errorText}`);
                }
            }

            const data = await response.json();
            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                throw new Error('Invalid API response structure');
            }

            return data.candidates[0].content.parts[0].text;
        });

        // Cache successful responses (except inspiration, editor_feedback and editor_revision)
        if (mode !== 'inspiration' && mode !== 'editor_feedback' && mode !== 'editor_revision') {
            const cacheKey = getCacheKey(userText, mode, context);
            responseCache.set(cacheKey, result);
            
            // Limit cache size
            if (responseCache.size > 50) {
                const firstKey = responseCache.keys().next().value;
                responseCache.delete(firstKey);
            }
        }

        return result;

    } catch (error) {
        console.error('AI call error:', error);
        
        // Provide more specific error messages
        if (error.message.includes('Server error') || error.message.includes('fetch')) {
            return "I'm having trouble connecting to the AI service. Please check your internet connection and try again.";
        } else if (error.message.includes('429')) {
            return "The AI service is busy right now. Please wait a moment and try again.";
        } else if (error.message.includes('Client error')) {
            return "There was an issue with your request. Please try again.";
        }
        
        return "I'm having trouble connecting right now. Please try again in a moment!";
    }
}
// Function to extract story context for consistency
function extractStoryContext(fullStory) {
    const text = fullStory.toLowerCase();
    
    // Extract potential character names (capitalized words that appear multiple times)
    const words = fullStory.match(/\b[A-Z][a-z]+\b/g) || [];
    const characterCounts = {};
    words.forEach(word => {
        if (word.length > 2) characterCounts[word] = (characterCounts[word] || 0) + 1;
    });
    const characters = Object.keys(characterCounts).filter(char => characterCounts[char] > 1);
    
    // Detect setting/environment
    let setting = "generic fantasy setting";
    if (text.includes('forest') || text.includes('tree')) setting = "magical forest setting";
    else if (text.includes('castle') || text.includes('kingdom')) setting = "fairy tale castle setting";
    else if (text.includes('ocean') || text.includes('sea')) setting = "ocean/underwater setting";
    else if (text.includes('space') || text.includes('star')) setting = "space/cosmic setting";
    else if (text.includes('school') || text.includes('classroom')) setting = "school setting";
    else if (text.includes('home') || text.includes('house')) setting = "cozy home setting";
    
    // Detect mood/tone
    let mood = "adventurous and uplifting";
    if (text.includes('scary') || text.includes('dark')) mood = "mysterious but safe";
    else if (text.includes('funny') || text.includes('laugh')) mood = "humorous and lighthearted";
    else if (text.includes('magic') || text.includes('spell')) mood = "magical and wonder-filled";
    
    return { characters, setting, mood };
}

// Function to build consistent prompts
function buildConsistentPrompt(paragraph, context, pageNum, totalPages) {
    const characterInfo = context.characters.length > 0 
        ? `Main characters: ${context.characters.slice(0, 3).join(', ')}. Keep these characters visually consistent with the same forms and features throughout all pages.`
        : "Maintain consistent simple character designs if characters appear, and send detailed prompts that are identical with each image for the characters.";
    
    return `Create a simple, artistic children's picture book illustration for page ${pageNum} of ${totalPages}.

STORY CONTEXT: This is part of a cohesive story set in a ${context.setting} with a ${context.mood} tone.

SCENE TO ILLUSTRATE: "${paragraph}"

CHARACTER CONSISTENCY: ${characterInfo}

ARTISTIC STYLE (Jon Klassen/Silverstein inspired):
- Hand-drawn quality with organic, slightly imperfect lines
- Simple forms but with artistic warmth and personality
- Painterly textures and subtle brush strokes
- Gentle, muted watercolor-style backgrounds
- Sketchy, expressive linework (not perfect vector lines)
- Soft edges and natural irregularities that feel human-made

VISUAL APPROACH:
- Simple symbolic-styled character shapes with artistic charm
- Limited color palette (2-4 warm, muted colors)
- Plenty of negative space but with subtle artistic texture
- Hand-lettered quality, not computer-perfect
- Cozy, intimate feeling like a hand-illustrated book
- Slight paper texture or watercolor bleeding effects
- No text in any of these images

COMPOSITION:
- Clean, thoughtful layout with artistic breathing room
- Focus on essential story elements only
- Simple but expressive character poses and faces
- Gentle, organic composition (not rigid geometric)
- Strategic use of white space with subtle artistic texture
- No text in any of these images

COLOR & TEXTURE:
- Warm, earthy palette with soft transitions
- Watercolor or gouache painting aesthetic
- Subtle color bleeding and organic edges
- Muted tones that feel cozy and inviting
- Consistent artistic treatment across all ${totalPages} pages

ARTISTIC QUALITY:
- Hand-drawn charm with slight imperfections that add warmth
- Soft, painterly backgrounds with gentle textures
- Expressive brushwork and organic line quality
- Feels like an artist's sketchbook, not a computer program
- Captures the soul and warmth of classic picture books

STORYTELLING:
- Simple but emotionally rich visual narrative
- Characters with personality through simple artistic choices
- Gentle, inviting atmosphere that draws children in
- Focus on feeling and mood over photographic accuracy
- No text in any of these images

CREATE: A beautifully simple but artistically rich illustration with the warmth and charm of hand-drawn children's book art. - No text in any of these images.`;
}
        
// Mobile-optimized image compression
function compressImageForMobile(base64Image, maxWidth = 800, quality = 0.8) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = () => {
            // Calculate new dimensions
            let { width, height } = img;
            if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
            }
            
            canvas.width = width;
            canvas.height = height;
            
            // Draw and compress
            ctx.drawImage(img, 0, 0, width, height);
            const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(compressedDataUrl);
        };
        
        img.onerror = () => resolve(base64Image); // Return original on error
        img.src = base64Image;
    });
}

// Network status detection
function isOnline() {
    return navigator.onLine;
}

// Illustrated book creation function with mobile optimizations
async function createIllustratedBook() {
    const title = document.getElementById('storyTitle').value.trim() || 'My Watch, Write, Read Tale';
    const story = document.getElementById('finalStory').textContent;
    
    if (!story) {
        alert('No story to illustrate! Please complete a story first.');
        return;
    }

    // Check network status
    if (!isOnline()) {
        if (confirm('You appear to be offline. Illustration generation requires an internet connection. Would you like to save the text-only story instead?')) {
            saveStoryToLibrary(title, currentStory, story);
            return;
        } else {
            return;
        }
    }

    // Set up the illustrated book page
    document.getElementById('bookTitle').textContent = title;
    showPage('illustratedBookPage');
    
    // Reset state
    illustratedPages = [];
    currentPageIndex = 0;
    
    // Show loading section
    document.getElementById('bookLoadingSection').style.display = 'block';
    document.getElementById('bookDisplaySection').style.display = 'none';
    
    try {
        // Break story into paragraphs (max 8 for mobile performance)
        const paragraphs = formatStoryText(story);
        const isMobile = window.innerWidth < 768;
        const maxPages = Math.min(paragraphs.length, isMobile ? 8 : 12);
        
        // Update progress
        document.getElementById('progressText').textContent = `Creating ${maxPages} illustrated pages...`;
        
        // Extract story context once
        const storyContext = extractStoryContext(story);
        
        // Generate images with controlled concurrency for mobile
        const concurrentLimit = isMobile ? 1 : 2; // Mobile: sequential, Desktop: 2 at once
        
        for (let i = 0; i < maxPages; i += concurrentLimit) {
            const batch = [];
            
            for (let j = 0; j < concurrentLimit && (i + j) < maxPages; j++) {
                const pageIndex = i + j;
                const paragraph = paragraphs[pageIndex];
                
                // Update progress
                document.getElementById('progressText').textContent = 
                    `Illustrating page ${pageIndex + 1} of ${maxPages}...`;
                
                const prompt = buildConsistentPrompt(paragraph, storyContext, pageIndex + 1, maxPages);
                
                const imagePromise = retryWithBackoff(async () => {
                    const response = await fetch('/api/generate-image', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            prompt: prompt,
                            pageNumber: pageIndex + 1,
                            mobileOptimized: isMobile
                        })
                    });
                    
                    if (!response.ok) {
                        throw new Error(`Image generation failed: ${response.status}`);
                    }
                    
                    const result = await response.json();
                    let imageUrl = result.success ? result.imageUrl : null;
                    
                    // Compress image for mobile
                    if (imageUrl && isMobile && imageUrl.startsWith('data:')) {
                        try {
                            imageUrl = await compressImageForMobile(imageUrl);
                        } catch (error) {
                            console.warn('Image compression failed, using original:', error);
                        }
                    }
                    
                    return {
                        text: paragraph,
                        imageUrl: imageUrl,
                        pageNumber: pageIndex + 1,
                        error: !result.success
                    };
                }, 2, 2000).catch(error => {
                    console.error(`Error generating image for page ${pageIndex + 1}:`, error);
                    return {
                        text: paragraph,
                        imageUrl: null,
                        pageNumber: pageIndex + 1,
                        error: true
                    };
                });
                
                batch.push(imagePromise);
            }
            
            // Wait for current batch to complete
            const batchResults = await Promise.all(batch);
            illustratedPages.push(...batchResults);
            
            // Small delay between batches to prevent overwhelming mobile devices
            if (i + concurrentLimit < maxPages && isMobile) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        // Show the completed book
        document.getElementById('bookLoadingSection').style.display = 'none';
        document.getElementById('bookDisplaySection').style.display = 'block';
        
        // Display first page
        showBookPage(0);
        
        // Save illustrated pages to cache for offline viewing
        const cacheKey = `illustrated_${title}_${Date.now()}`;
        try {
            saveToStorage(cacheKey, illustratedPages);
        } catch (error) {
            console.warn('Could not cache illustrated pages:', error);
        }
        
    } catch (error) {
        console.error('Error creating illustrated book:', error);
        alert('Sorry, there was an error creating your illustrated book. Please check your connection and try again.');
        showPage('successPage');
    }
}

// Function to download illustrated book as PDF
async function downloadIllustratedBookAsPDF() {
    if (!illustratedPages || illustratedPages.length === 0) {
        alert('No illustrated book to download!');
        return;
    }

    try {
        // Create a simple HTML document for PDF conversion
        const title = document.getElementById('bookTitle').textContent;
        
        // Start building the PDF content
        let pdfContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>${title}</title>
            <style>
                body { 
                    font-family: 'Segoe UI', Arial, sans-serif; 
                    margin: 0; 
                    padding: 20px;
                    background: white;
                }
                .page { 
                    page-break-after: always; 
                    min-height: 90vh; 
                    display: flex; 
                    flex-direction: column; 
                    align-items: center; 
                    justify-content: center;
                    padding: 20px;
                    margin-bottom: 40px;
                }
                .page:last-child { page-break-after: avoid; }
                .page-image { 
                    max-width: 80%; 
                    max-height: 60vh; 
                    object-fit: contain; 
                    border-radius: 8px;
                    margin-bottom: 20px;
                }
                .page-text { 
                    font-size: 18px; 
                    line-height: 1.6; 
                    text-align: center; 
                    max-width: 600px; 
                    color: #374151;
                    margin-bottom: 10px;
                }
                .page-number { 
                    color: #6b7280; 
                    font-size: 14px; 
                }
                .title-page {
                    text-align: center;
                    page-break-after: always;
                }
                .title-page h1 {
                    font-size: 2.5rem;
                    color: #1e40af;
                    margin-bottom: 20px;
                }
                .title-page p {
                    font-size: 1.2rem;
                    color: #6b7280;
                    font-style: italic;
                }
                .image-placeholder {
                    width: 400px;
                    height: 300px;
                    background: #f3f4f6;
                    border: 2px dashed #d1d5db;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #6b7280;
                    margin-bottom: 20px;
                }
                @media print {
                    .page { margin-bottom: 0; }
                }
            </style>
        </head>
        <body>
            <div class="title-page">
                <h1>${title}</h1>
                <p>Created with Watch, Write, Read</p>
                <p style="margin-top: 40px;">Where Stories Are Forged, Not Just Written</p>
            </div>
        `;

        // Add each page
        for (let i = 0; i < illustratedPages.length; i++) {
            const page = illustratedPages[i];
            
            pdfContent += `
            <div class="page">
                ${page.imageUrl && !page.error 
                    ? `<img src="${page.imageUrl}" alt="Illustration for page ${page.pageNumber}" class="page-image">`
                    : `<div class="image-placeholder">🎨<br>Illustration for Page ${page.pageNumber}</div>`
                }
                <div class="page-text">${page.text}</div>
                <div class="page-number">Page ${page.pageNumber}</div>
            </div>
            `;
        }

        pdfContent += `
        </body>
        </html>
        `;

        // Create a blob and download
        const blob = new Blob([pdfContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.replace(/[^a-z0-9]/gi, '_')}_illustrated_book.html`;
        a.click();
        URL.revokeObjectURL(url);

        // Also offer to save as illustrated story to library
        if (confirm('Would you like to save this illustrated story to your library for easy access later?')) {
            saveIllustratedStoryToLibrary(title);
        }

    } catch (error) {
        console.error('Error creating PDF:', error);
        alert('Sorry, there was an error creating the download. You can still screenshot each page manually.');
    }
}

// Function to save illustrated story to library
function saveIllustratedStoryToLibrary(title) {
    const stories = loadFromStorage('stories') || [];
    const finalStoryText = document.getElementById('finalStory').textContent;
    
    const illustratedStory = {
        id: Date.now().toString() + '_illustrated',
        title: title + ' (Illustrated)',
        originalStory: currentStory,
        finalStory: finalStoryText,
        illustratedPages: illustratedPages.map(page => ({
            text: page.text,
            pageNumber: page.pageNumber,
            hasImage: !!(page.imageUrl && !page.error)
        })),
        isIllustrated: true,
        createdAt: new Date().toISOString()
    };
    
    stories.unshift(illustratedStory);
    saveToStorage('stories', stories);
    
    alert('Illustrated story saved to your library! ✨');
}
        
// Function to display a specific book page
function showBookPage(pageIndex) {
    if (pageIndex < 0 || pageIndex >= illustratedPages.length) return;
    
    currentPageIndex = pageIndex;
    const page = illustratedPages[pageIndex];
    const pageDisplay = document.getElementById('bookPageDisplay');
    
    // Update page counter
    document.getElementById('pageCounter').textContent = 
        `Page ${pageIndex + 1} of ${illustratedPages.length}`;
    
    // Update navigation buttons
    document.getElementById('prevPage').disabled = pageIndex === 0;
    document.getElementById('nextPage').disabled = pageIndex === illustratedPages.length - 1;
    
    // Create page content
    let imageHTML;
    if (page.imageUrl && !page.error) {
        imageHTML = `<img src="${page.imageUrl}" alt="Illustration for page ${page.pageNumber}">`;
    } else {
        imageHTML = `
            <div class="image-error">
                <div class="error-icon">🎨</div>
                <div>Illustration ${page.error ? 'failed to generate' : 'coming soon'}</div>
            </div>
        `;
    }
    
    pageDisplay.innerHTML = `
        ${imageHTML}
        <div class="page-text">${page.text}</div>
        <div class="page-number">Page ${page.pageNumber}</div>
    `;
}


      
// Story download function
function downloadStory() {
    const title = document.getElementById('storyTitle').value || 'My Watch, Write, Read Tale';
    const story = document.getElementById('finalStory').textContent;
    const content = `${title}\n\nForged with Watch, Write, Read\nWhere Stories Are Read, Not Just Written\n\n${story}\n\nCreated by: ${currentUser}\nDate: ${new Date().toLocaleDateString()}`;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

// Library management
function loadLibrary() {
    const stories = loadFromStorage('stories') || [];
    const container = document.getElementById('storiesContainer');
    const loading = document.getElementById('loadingStories');
    const noStories = document.getElementById('noStories');
    const storiesList = document.getElementById('storiesList');

    loading.style.display = 'none';

    if (stories.length === 0) {
        noStories.style.display = 'block';
        storiesList.innerHTML = '';
        return;
    }
    noStories.style.display = 'none'; 
    storiesList.innerHTML = stories.map(story => `
    <div class="story-item" onclick="viewStory('${story.id}')">
    <div class="story-title">
    ${story.isIllustrated ? '📖 ' : ''}${story.title}
    ${story.isIllustrated ? '<span style="color: #10b981; font-size: 0.8rem; margin-left: 8px;">Illustrated</span>' : ''}
    </div>
    <div class="story-date">Created: ${new Date(story.createdAt).toLocaleDateString()}</div>
    ${story.isIllustrated ? `<div style="color: #6b7280; font-size: 0.8rem; margin-top: 4px;">${story.illustratedPages?.length || 0} illustrated pages</div>` : ''}
    </div>
    `).join('');
}

function viewStory(storyId) {
    const stories = loadFromStorage('stories') || [];
    const story = stories.find(s => s.id === storyId);
    if (story) {
        if (story.isIllustrated) {
            alert('Illustrated stories can only be viewed in the illustrated book reader.');
        } else {
            storyReaderInfo.story = story;
            storyReaderInfo.paragraphs = story.finalStory.split(/<p>|<\/p>/).filter(p => p.trim().length > 0);
            storyReaderInfo.currentPage = 0;
            showStoryReaderPage();
        }
    }
}

function showStoryReaderPage() {
    const { story, paragraphs, currentPage } = storyReaderInfo;
    document.getElementById('storyReaderTitle').textContent = story.title;
    document.getElementById('storyReaderContent').innerHTML = `<p>${paragraphs[currentPage]}</p>`;
    document.getElementById('prevStoryPage').disabled = currentPage === 0;
    document.getElementById('nextStoryPage').disabled = currentPage === paragraphs.length - 1;
    showPage('storyReaderPage');
}

function clearLibrary() {
    if (confirm('Are you sure you want to clear all your stories? This cannot be undone.')) {
        localStorage.removeItem('storyforge_stories');
        loadLibrary();
    }
}

// XP System Functions
function loadUserProgress() {
    const saved = loadFromStorage('userProgress');
    if (saved) {
        userProgress = saved;
        updateXPDisplay();
    }
}

function saveUserProgress() {
    saveToStorage('userProgress', userProgress);
}

function awardXP(amount, reason) {
    userProgress.xp += amount;
    
    // Check for level up
    const xpForNextLevel = userProgress.level * 100;
    if (userProgress.xp >= xpForNextLevel) {
        userProgress.level++;
        userProgress.xp = userProgress.xp - xpForNextLevel;
        showXPNotification(`🎉 Level Up! You're now Level ${userProgress.level}!`);
    } else {
        showXPNotification(`+${amount} XP: ${reason}`);
    }
    
    saveUserProgress();
    updateXPDisplay();
}

function updateXPDisplay() {
    const xpBar = document.getElementById('xpBarContainer');
    if (!xpBar) return;
    
    // Show XP bar
    xpBar.style.display = 'flex';
    
    // Update level badge
    document.getElementById('levelBadge').textContent = `Level ${userProgress.level}`;
    
    // Update XP text
    const xpForNextLevel = userProgress.level * 100;
    document.getElementById('xpText').textContent = `${userProgress.xp} / ${xpForNextLevel} XP`;
    
    // Update progress bar
    const percentage = (userProgress.xp / xpForNextLevel) * 100;
    const progressBar = document.getElementById('xpProgress');
    progressBar.style.width = `${percentage}%`;
    document.getElementById('xpPercentage').textContent = `${Math.round(percentage)}%`;
}

function showXPNotification(message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'xp-notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Remove after animation
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Auto-save functionality
function startAutoSave() {
    // Clear any existing interval
    if (videoWritingState.autoSaveInterval) {
        clearInterval(videoWritingState.autoSaveInterval);
    }
    
    // Auto-save every 3 seconds
    videoWritingState.autoSaveInterval = setInterval(() => {
        const textarea = document.getElementById('videoStoryText');
        if (textarea && textarea.value.trim()) {
            saveDraft(textarea.value);
            showAutoSaveIndicator();
        }
    }, 3000);
}

function stopAutoSave() {
    if (videoWritingState.autoSaveInterval) {
        clearInterval(videoWritingState.autoSaveInterval);
        videoWritingState.autoSaveInterval = null;
    }
}

function saveDraft(content) {
    const draft = {
        content: content,
        timestamp: new Date().toISOString(),
        videoId: selectedVideo?.id
    };
    saveToStorage('currentDraft', draft);
}

function loadDraft() {
    return loadFromStorage('currentDraft');
}

function clearDraft() {
    localStorage.removeItem('storyforge_currentDraft');
}

function showAutoSaveIndicator() {
    const indicator = document.getElementById('autoSaveIndicator');
    if (indicator) {
        indicator.classList.add('visible');
        setTimeout(() => {
            indicator.classList.remove('visible');
        }, 2000);
    }
}

// Word count goal functionality
function updateWordCountGoal() {
    const textarea = document.getElementById('videoStoryText');
    const wordGoal = videoWritingState.wordGoal;
    
    if (!textarea) return;
    
    const currentText = textarea.value.trim();
    const wordCount = currentText.split(/\s+/).filter(word => word.length > 0).length;
    
    // Update word count display
    document.getElementById('currentWordCount').textContent = wordCount;
    document.getElementById('wordGoal').textContent = wordGoal;
    
    // Update progress bar
    const progressBar = document.getElementById('wordGoalProgressBar');
    if (progressBar) {
        const percentage = Math.min((wordCount / wordGoal) * 100, 100);
        progressBar.style.width = `${percentage}%`;
        
        // Change color when goal is met
        if (wordCount >= wordGoal) {
            progressBar.classList.add('complete');
            
            // Enable continue/submit button
            const continueButton = document.getElementById('continueWatching');
            if (continueButton) {
                continueButton.disabled = false;
            }
        } else {
            progressBar.classList.remove('complete');
        }
    }
}

// Enhanced validate writing input with word goals
function validateWritingInputEnhanced() {
    updateWordCountGoal();
    
    const textarea = document.getElementById('videoStoryText');
    const currentText = textarea.value.trim();
    const wordCount = currentText.split(/\s+/).filter(word => word.length > 0).length;
    const wordGoal = videoWritingState.wordGoal;
    
    // Enable continue button if word goal is met
    const continueButton = document.getElementById('continueWatching');
    if (wordCount >= wordGoal) {
        continueButton.disabled = false;
    } else {
        continueButton.disabled = true;
    }
}

// Enhanced continue function with XP rewards
function continueVideoOrSubmitEnhanced() {
    const textarea = document.getElementById('videoStoryText');
    const currentText = textarea.value.trim();
    
    if (videoWritingState.isVideoEnded) {
        // Save final section
        if (currentText) {
            videoWritingState.sections.push({
                number: videoWritingState.currentSegment,
                text: currentText
            });
        }
        
        // Compile all sections into final story
        const fullStory = videoWritingState.sections.map(s => s.text).join('\n\n');
        
        // Award XP for completing the story
        const wordCount = fullStory.split(/\s+/).filter(word => word.length > 0).length;
        userProgress.totalWords += wordCount;
        userProgress.storiesCompleted++;
        
        awardXP(50, 'Completed video story!');
        
        // Stop auto-save
        stopAutoSave();
        clearDraft();
        
        // Set the full story and move to editor
        currentStory = fullStory;
        const editableStory = document.getElementById('editableStory');
        if (editableStory) {
            editableStory.value = fullStory;
        }
        
        // Reset video state
        resetVideoWritingState();
        
        // Move to editor page
        showPage('editorPage');
    } else {
        // Save current section to sections array
        if (currentText) {
            videoWritingState.sections.push({
                number: videoWritingState.currentSegment,
                text: currentText
            });
            
            // Award XP for completing a segment
            const segmentWords = currentText.split(/\s+/).filter(word => word.length > 0).length;
            if (segmentWords >= videoWritingState.wordGoal) {
                userProgress.segmentsCompleted++;
                awardXP(10, 'Completed writing segment!');
            }
        }
        
        // Stop auto-save before continuing
        stopAutoSave();
        
        // Continue video playback
        startVideoWritingCycle();
    }
}

// Helper function to display previous sections
function updatePreviousSectionsDisplay() {
    const previousSectionsContainer = document.getElementById('previousSections');
    
    if (!previousSectionsContainer) return;
    
    if (videoWritingState.sections.length === 0) {
        previousSectionsContainer.style.display = 'none';
        return;
    }
    
    previousSectionsContainer.style.display = 'block';
    previousSectionsContainer.innerHTML = '';
    
    videoWritingState.sections.forEach((section, index) => {
        const sectionDiv = document.createElement('div');
        sectionDiv.className = 'section-item';
        sectionDiv.innerHTML = `
            <div class="section-separator">
                <span>Section ${section.number}</span>
            </div>
            <div>${section.text}</div>
        `;
        previousSectionsContainer.appendChild(sectionDiv);
    });
}

// Offline mode and network monitoring
let isOfflineMode = false;

function updateOfflineStatus() {
    isOfflineMode = !navigator.onLine;
    
    // Update UI to show offline status
    const offlineIndicator = document.getElementById('offlineIndicator');
    if (offlineIndicator) {
        offlineIndicator.style.display = isOfflineMode ? 'block' : 'none';
    }
    
    // Disable AI-dependent features when offline
    const aiButtons = document.querySelectorAll('[data-requires-ai]');
    aiButtons.forEach(button => {
        if (isOfflineMode) {
            button.disabled = true;
            button.title = 'This feature requires an internet connection';
        } else {
            button.disabled = false;
            button.removeAttribute('title');
        }
    });
}

// Production monitoring and error tracking
function logError(error, context = '') {
    const errorData = {
        message: error.message || 'Unknown error',
        stack: error.stack,
        context: context,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        userId: currentUser,
        isOnline: navigator.onLine
    };
    
    console.error('StoryForge Error:', errorData);
    
    // Store error locally for later analysis
    try {
        const errors = loadFromStorage('errors') || [];
        errors.push(errorData);
        
        // Keep only last 50 errors to prevent storage bloat
        if (errors.length > 50) {
            errors.splice(0, errors.length - 50);
        }
        
        saveToStorage('errors', errors);
    } catch (storageError) {
        console.warn('Could not store error data:', storageError);
    }
    
    // Send to server if online (for production monitoring)
    if (navigator.onLine && typeof fetch !== 'undefined') {
        fetch('/api/analytics/error', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(errorData)
        }).catch(() => {}); // Silently fail to avoid error loops
    }
}

// Performance monitoring
function trackPerformance(eventName, data = {}) {
    const performanceData = {
        event: eventName,
        data: data,
        timestamp: new Date().toISOString(),
        userId: currentUser,
        isOnline: navigator.onLine,
        isMobile: window.innerWidth < 768
    };
    
    // Send to server if online
    if (navigator.onLine && typeof fetch !== 'undefined') {
        fetch('/api/analytics/performance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(performanceData)
        }).catch(() => {}); // Silently fail
    }
}

// Global error handler
window.addEventListener('error', (event) => {
    logError(event.error || new Error(event.message), 'Global error handler');
});

window.addEventListener('unhandledrejection', (event) => {
    logError(new Error(event.reason), 'Unhandled promise rejection');
});

// Network status monitoring
window.addEventListener('online', updateOfflineStatus);
window.addEventListener('offline', updateOfflineStatus);

// Event listeners
document.addEventListener('DOMContentLoaded', async () => {
    try {
        trackPerformance('app_start');
        
        await loadComponents();

        // Initialize offline status
        updateOfflineStatus();
        
        // Initialize XP system
        loadUserProgress();

        // All event listeners and initial page display logic moved here
        // Check for existing user
        const savedUser = loadFromStorage('user');
        if (savedUser) {
            currentUser = savedUser;
        }

        showPage('welcomePage');
        
        trackPerformance('app_loaded');
    } catch (error) {
        logError(error, 'App initialization');
        // Show fallback UI
        document.body.innerHTML = `
            <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
                <h1>Watch, Write, Read</h1>
                <p>Sorry, there was a problem loading the app. Please refresh the page and try again.</p>
                <button onclick="window.location.reload()">Reload Page</button>
            </div>
        `;
    }

    // Welcome page - Updated button handlers
    const watchAndWriteChoice = document.getElementById('watchAndWriteChoice');
    if (watchAndWriteChoice) {
        watchAndWriteChoice.addEventListener('click', async () => {
            await displayVideoOptions();
            showPage('inspirationPage');
        });
    }

    const readChoice = document.getElementById('readChoice');
    if (readChoice) {
        readChoice.addEventListener('click', () => {
            showPage('libraryPage');
            loadLibrary();
        });
    }

    // Video inspiration page
    const startWithVideo = document.getElementById('startWithVideo');
    if (startWithVideo) {
        startWithVideo.addEventListener('click', () => {
            if (selectedVideo) {
                // Set up video writing page
                document.getElementById('selectedVideoTitle').textContent = selectedVideo.title;
                showPage('videoWritingPage');
            } else {
                alert('Please select a video first!');
            }
        });
    }

    // Video writing page
    const startVideoWriting = document.getElementById('startVideoWriting');
    if (startVideoWriting) {
        startVideoWriting.addEventListener('click', async () => {
            if (selectedVideo) {
                // Initialize YouTube player
                await initializeVideoPlayer(selectedVideo.id);
                
                // Hide start button and show video interface
                document.getElementById('startVideoWriting').style.display = 'none';
                document.getElementById('backToVideoSelection').style.display = 'none';
                
                // Start the video writing cycle
                startVideoWritingCycle();
            }
        });
    }

    const backToVideoSelection = document.getElementById('backToVideoSelection');
    if (backToVideoSelection) {
        backToVideoSelection.addEventListener('click', () => {
            resetVideoWritingState();
            showPage('inspirationPage');
        });
    }

    const continueWatching = document.getElementById('continueWatching');
    if (continueWatching) {
        continueWatching.addEventListener('click', () => {
            continueVideoOrSubmitEnhanced();
        });
    }

    // Add input validation for video writing with word count goals
    const videoStoryText = document.getElementById('videoStoryText');
    if (videoStoryText) {
        videoStoryText.addEventListener('input', validateWritingInputEnhanced);
    }

    // New Story Options page - Add null checks
    const haveIdea = document.getElementById('haveIdea');
    if (haveIdea) {
        haveIdea.addEventListener('click', () => {
            showPage('editorPage');
        });
    }

    // Reusable function to generate and display inspiration
    async function generateAndDisplayInspiration() {
        showPage('inspirationPage');
        const inspirationContainer = document.getElementById('inspirationContainer');
        inspirationContainer.innerHTML = '<div class="loading">Generating inspiration...</div>';
        
        try {
            const inspirationText = await callStoryForgeAI('', 'inspiration');
            
            // Parse the inspiration text and display it with genre labels
            inspirationContainer.innerHTML = ''; // Clear loading message

            try {
                // Try parsing with expected format first
                const blocks = inspirationText.split('\n\n'); // Split by double newline to get genre blocks
                let hasValidBlocks = false;

                blocks.forEach(block => {
                    if (block.trim() === '') return; // Skip empty blocks

                    // Try both formats: "**Genre:** text" and "Genre: text"
                    const genreMatch = block.match(/(\*\*)?(.*?)(\*\*)?:\s*(.*)/s);
                    
                    if (genreMatch && genreMatch[2] && genreMatch[4]) {
                        const genre = genreMatch[2].trim();
                        const sentence = genreMatch[4].trim().replace(/\n/g, ' '); // Replace internal newlines with spaces
                        hasValidBlocks = true;

                        const genreDiv = document.createElement('div');
                        genreDiv.className = 'inspiration-genre';
                        genreDiv.innerHTML = `<h3>${genre}</h3><p>${sentence}</p>`;
                        genreDiv.addEventListener('click', () => {
                            document.querySelectorAll('.inspiration-genre').forEach(el => {
                                el.classList.remove('selected');
                            });
                            genreDiv.classList.add('selected');
                            selectedInspirationText = sentence;
                        });
                        inspirationContainer.appendChild(genreDiv);
                    }
                });

                // Fallback if no valid blocks found
                if (!hasValidBlocks) {
                    const fallbackGenres = ['Real World', 'Traditional Fantasy', 'Science Fiction', 'Absurdism'];
                    const sentences = inspirationText.split('\n').filter(s => s.trim().length > 0);
                    
                    fallbackGenres.forEach((genre, i) => {
                        const sentence = sentences[i] || 'An interesting story idea goes here!';
                        const genreDiv = document.createElement('div');
                        genreDiv.className = 'inspiration-genre';
                        genreDiv.innerHTML = `<h3>${genre}</h3><p>${sentence}</p>`;
                        inspirationContainer.appendChild(genreDiv);
                    });
                }
            } catch (error) {
                console.error('Error parsing inspiration:', error);
                inspirationContainer.innerHTML = `
                    <div class="error-message">
                        <p>Couldn't parse the ideas. Here are some fallback prompts:</p>
                        <div class="inspiration-genre">
                            <h3>Real World</h3>
                            <p>When I found the old key in my grandmother's attic, I never imagined what door it would open.</p>
                        </div>
                        <div class="inspiration-genre">
                            <h3>Traditional Fantasy</h3>
                            <p>The dragon's egg had been still for a hundred years, until today when it began to tremble.</p>
                        </div>
                        <div class="inspiration-genre">
                            <h3>Science Fiction</h3>
                            <p>The spaceship's AI suddenly stopped responding, leaving us alone in the vast emptiness of space.</p>
                        </div>
                        <div class="inspiration-genre">
                            <h3>Absurdism</h3>
                            <p>The mayor declared Tuesday illegal, and now everyone had to pretend it was still Monday.</p>
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error generating inspiration:', error);
            inspirationContainer.innerHTML = `
                <div class="error-message">
                    <p>Couldn't generate new ideas right now. Here are some fallback prompts:</p>
                    <div class="inspiration-genre">
                        <h3>Real World</h3>
                        <p>When I found the old key in my grandmother's attic, I never imagined what door it would open.</p>
                    </div>
                    <div class="inspiration-genre">
                        <h3>Traditional Fantasy</h3>
                        <p>The dragon's egg had been still for a hundred years, until today when it began to tremble.</p>
                    </div>
                </div>
            `;
        }
    }

    const needsInspiration = document.getElementById('needsInspiration');
    if (needsInspiration) {
        needsInspiration.addEventListener('click', generateAndDisplayInspiration);
    }

    // Add event listener for "Show me other ideas" button
    const generateMoreInspiration = document.getElementById('generateMoreInspiration');
    if (generateMoreInspiration) {
        generateMoreInspiration.addEventListener('click', generateAndDisplayInspiration);
    }

    // Event listener for "Start Writing" button
    const startWithInspiration = document.getElementById('startWithInspiration');
    if (startWithInspiration) {
        startWithInspiration.addEventListener('click', () => {
            if (selectedInspirationText) {
                // Set the selected inspiration as the story
                const editableStory = document.getElementById('editableStory');
                if (editableStory) {
                    editableStory.value = selectedInspirationText;
                    showPage('editorPage');
                }
            } else {
                alert('Please select an idea first!');
            }
        });
    }

    // Workshop page
    const getEditorFeedback = document.getElementById('getEditorFeedback');
    if (getEditorFeedback) {
        getEditorFeedback.addEventListener('click', async () => {
            const story = document.getElementById('storyInput').value.trim();
            if (!story) {
                alert('Please write your story first!');
                return;
            }
            
            currentStory = story;
            currentRevision = 0;
            const editableStory = document.getElementById('editableStory');
            if (editableStory) {
                editableStory.value = story;
            }
            
            const feedbackContainer = document.getElementById('feedbackContainer');
            if (feedbackContainer) {
                feedbackContainer.innerHTML = '<div class="loading">Your Editor is reviewing your story...</div>';
            }
            
            showPage('editorPage');
            
            const feedbackJSON = await callStoryForgeAI(story, 'editor_feedback');
            
            try {
                // Strip markdown code blocks before parsing JSON
                const cleanJSON = feedbackJSON.replace(/```json\s*|\s*```/g, '').trim();
                const feedback = JSON.parse(cleanJSON);
                if (feedbackContainer) {
                    feedbackContainer.innerHTML = ''; // Clear loading message
                    
                    feedback.forEach(item => {
                        const feedbackItem = document.createElement('div');
                        feedbackItem.className = `feedback-item feedback-${item.type}`;
                        
                        let content = `<strong>${item.type.charAt(0).toUpperCase() + item.type.slice(1)}:</strong> ${item.text}`;
                        if (item.quote) {
                            content += `<div class="feedback-quote">"${item.quote}"</div>`;
                        }
                        
                        feedbackItem.innerHTML = content;
                        feedbackContainer.appendChild(feedbackItem);
                    });
                }
            } catch (error) {
                console.error('Error parsing feedback JSON:', error);
                if (feedbackContainer) {
                    feedbackContainer.innerHTML = '<div class="error-message">There was an issue getting feedback. Please try again.</div>';
                }
            }
        });
    }

    const backToDashboard = document.getElementById('backToDashboard');
    if (backToDashboard) {
        backToDashboard.addEventListener('click', () => {
            showPage('libraryPage');
            loadLibrary();
        });
    }

    // Editor page
    const submitRevision = document.getElementById('submitRevision');
    if (submitRevision) {
        submitRevision.addEventListener('click', async () => {
            const revisedStory = document.getElementById('editableStory').value.trim();
            if (!revisedStory) {
                alert('Please revise your story!');
                return;
            }

            currentRevision++;
            const feedbackContainer = document.getElementById('feedbackContainer');
            // Clear existing feedback before adding new revision feedback
            feedbackContainer.innerHTML = '';
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'loading';
            loadingDiv.textContent = 'Your Editor is reviewing your revision...';
            feedbackContainer.appendChild(loadingDiv);

            const feedbackJSON = await callStoryForgeAI(revisedStory, 'editor_revision', currentStory);
            
            feedbackContainer.removeChild(loadingDiv);

            try {
                // Strip markdown code blocks before parsing JSON
                const cleanJSON = feedbackJSON.replace(/```json\s*|\s*```/g, '').trim();
                const feedback = JSON.parse(cleanJSON);
                const feedbackItem = document.createElement('div');
                feedbackItem.className = 'feedback-item feedback-revision';
                feedbackItem.innerHTML = `<p>${feedback.response}</p>`;
                feedbackContainer.appendChild(feedbackItem);
            } catch (error) {
                console.error('Error parsing revision feedback JSON:', error);
                const errorItem = document.createElement('div');
                errorItem.className = 'error-message';
                errorItem.textContent = 'There was an issue getting feedback on your revision. Please try again.';
                feedbackContainer.appendChild(errorItem);
            }

            currentStory = revisedStory;

            if (currentRevision >= 2) {
                const likeAsIs = document.getElementById('likeAsIs');
                if (likeAsIs) {
                    likeAsIs.style.display = 'block';
                }
            }

            if (currentRevision >= maxRevisions) {
                const acceptStory = document.getElementById('acceptStory');
                if (acceptStory) {
                    acceptStory.textContent = 'Move to Guild!';
                }
            }
        });
    }

    const acceptStory = document.getElementById('acceptStory');
    if (acceptStory) {
        acceptStory.addEventListener('click', () => {
            const editableStory = document.getElementById('editableStory');
            if (editableStory) {
                currentStory = editableStory.value.trim();
                showPage('guildPage');
            }
        });
    }

    const likeAsIs = document.getElementById('likeAsIs');
    if (likeAsIs) {
        likeAsIs.addEventListener('click', async () => {
            const editableStory = document.getElementById('editableStory');
            if (editableStory) {
                const story = editableStory.value.trim();
                const summary = await callStoryForgeAI(story, 'summarize_strengths');
                const responseDiv = document.getElementById('editorResponse');
                if (responseDiv) {
                    const p = document.createElement('p');
                    responseDiv.innerHTML = '';
                    responseDiv.appendChild(p);
                    typeWriter(p, summary);
                    const editorButtons = document.getElementById('editorButtons');
                    if (editorButtons) {
                        editorButtons.style.display = 'none';
                    }
                }
            }
        });
    }

    // Guild page
    const allowCollaboration = document.getElementById('allowCollaboration');
    if (allowCollaboration) {
        allowCollaboration.addEventListener('click', async () => {
            document.getElementById('guildChoice').style.display = 'none';
            document.getElementById('guildStorySection').style.display = 'block';
            
            guildRevisionCount = 0;
            const guildStoryDiv = document.getElementById('guildStory');
            guildStoryDiv.innerHTML = '<div class="loading">The Guild writer is crafting their version...</div>';

            const guildStory = await callStoryForgeAI(currentStory, 'guild_story');
            currentGuildStory = guildStory;
            typeWriter(guildStoryDiv, guildStory);
        });
    }

    const declineCollaboration = document.getElementById('declineCollaboration');
    if (declineCollaboration) {
        declineCollaboration.addEventListener('click', () => {
            displayFormattedStory('finalStory', currentStory);
            showPage('successPage');
        });
    }

    const submitFeedback = document.getElementById('submitFeedback');
    if (submitFeedback) {
        submitFeedback.addEventListener('click', async () => {
            const feedback = document.getElementById('feedbackInput').value.trim();
            if (!feedback) {
                alert('Please provide feedback for the Guild writer!');
                return;
            }

            guildRevisionCount++;
            
            // Show loading for both response and new story
            const guildStoryDiv = document.getElementById('guildStory');
            guildStoryDiv.innerHTML = '<div class="loading">The Guild writer is revising the story based on your feedback...</div>';

            // Get both the response AND the revised story
            const revisedStory = await callStoryForgeAI(feedback, 'guild_feedback', currentGuildStory);
            const writerResponse = await callStoryForgeAI(feedback, 'guild_feedback_response');
            
            // Update the current story
            currentGuildStory = revisedStory;
            typeWriter(guildStoryDiv, revisedStory);
            
            // Show the writer's response
            const responseDiv = document.createElement('div');
            responseDiv.className = 'ai-response';
            const p = document.createElement('p');
            responseDiv.innerHTML = '';
            responseDiv.appendChild(p)
            typeWriter(p, writerResponse);
            document.getElementById('guildStorySection').appendChild(responseDiv);

            document.getElementById('feedbackInput').value = '';

            if (guildRevisionCount >= maxGuildRevisions) {
                const approveFinalStoryBtn = document.getElementById('approveFinalStory');
                if (approveFinalStoryBtn) {
                    approveFinalStoryBtn.textContent = 'Finish Story!';
                }
            }
        });
    }

    const approveFinalStory = document.getElementById('approveFinalStory');
    if (approveFinalStory) {
        approveFinalStory.addEventListener('click', () => {
            displayFormattedStory('finalStory', currentGuildStory);
            showPage('successPage');
        });
    }

    // Success page
    const saveStory = document.getElementById('saveStory');
    if (saveStory) {
        saveStory.addEventListener('click', () => {
            const title = document.getElementById('storyTitle').value.trim();
            const finalStoryDiv = document.getElementById('finalStory');
            const finalStory = finalStoryDiv.innerHTML; // Get formatted HTML
            
            saveStoryToLibrary(title, currentStory, finalStory);
            alert('Story saved to your library!');
            
            // Reset for next story
            currentStory = '';
            currentGuildStory = '';
            currentRevision = 0;
            guildRevisionCount = 0;
            
            showPage('libraryPage');
            loadLibrary();
        });
    }

    const downloadStoryBtn = document.getElementById('downloadStory');
    if (downloadStoryBtn) {
        downloadStoryBtn.addEventListener('click', downloadStory);
    }

    const createAnother = document.getElementById('createAnother');
    if (createAnother) {
        createAnother.addEventListener('click', async () => {
            // Reset story state
            currentStory = '';
            currentGuildStory = '';
            currentRevision = 0;
            guildRevisionCount = 0;
            selectedVideo = null;
            selectedInspirationText = '';
            
            // Load video options and show the video selection page
            await displayVideoOptions();
            showPage('inspirationPage');
        });
    }

    const viewLibraryBtn = document.getElementById('viewLibrary');
    if (viewLibraryBtn) {
        viewLibraryBtn.addEventListener('click', () => {
            showPage('libraryPage');
            loadLibrary();
        });
    }

    // Illustrated book functionality
    const createIllustratedBookBtn = document.getElementById('createIllustratedBook');
    if (createIllustratedBookBtn) {
        createIllustratedBookBtn.addEventListener('click', createIllustratedBook);
    }
    
    const prevPageBtn = document.getElementById('prevPage');
    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', () => {
            if (currentPageIndex > 0) {
                showBookPage(currentPageIndex - 1);
            }
        });
    }
    
    const nextPageBtn = document.getElementById('nextPage');
    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', () => {
            if (currentPageIndex < illustratedPages.length - 1) {
                showBookPage(currentPageIndex + 1);
            }
        });
    }
    
    const backToStoryBtn = document.getElementById('backToStory');
    if (backToStoryBtn) {
        backToStoryBtn.addEventListener('click', () => {
            showPage('successPage');
        });
    }
    
    const downloadIllustratedBookBtn = document.getElementById('downloadIllustratedBook');
    if (downloadIllustratedBookBtn) {
        downloadIllustratedBookBtn.addEventListener('click', () => {
            downloadIllustratedBookAsPDF();
        });
    }

    // Library page
    const newStoryButton = document.getElementById('newStoryButton');
    if (newStoryButton) {
        newStoryButton.addEventListener('click', () => {
            document.getElementById('storyInput').value = '';
            showPage('workshopPage');
        });
    }

    const clearLibraryButton = document.getElementById('clearLibraryButton');
    if (clearLibraryButton) {
        clearLibraryButton.addEventListener('click', clearLibrary);
    }

    // Story Reader Page
    const prevStoryPageBtn = document.getElementById('prevStoryPage');
    if (prevStoryPageBtn) {
        prevStoryPageBtn.addEventListener('click', () => {
            if (storyReaderInfo.currentPage > 0) {
                storyReaderInfo.currentPage--;
                showStoryReaderPage();
            }
        });
    }

    const nextStoryPageBtn = document.getElementById('nextStoryPage');
    if (nextStoryPageBtn) {
        nextStoryPageBtn.addEventListener('click', () => {
            if (storyReaderInfo.currentPage < storyReaderInfo.paragraphs.length - 1) {
                storyReaderInfo.currentPage++;
                showStoryReaderPage();
            }
        });
    }

    const backToLibraryFromReaderBtn = document.getElementById('backToLibraryFromReader');
    if (backToLibraryFromReaderBtn) {
        backToLibraryFromReaderBtn.addEventListener('click', () => {
            showPage('libraryPage');
        });
    }
});
