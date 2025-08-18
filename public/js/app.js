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

// Page management
async function loadComponents() {
    const app = document.getElementById('app');
    const components = [
        'welcomePage', 'workshopPage', 'editorPage',
        'guildPage', 'successPage', 'illustratedBookPage', 'libraryPage',
        'newStoryOptionsPage', 'inspirationPage', 'storyReaderPage'
    ];

    for (const component of components) {
        const response = await fetch(`components/${component}.html`);
        const html = await response.text();
        app.innerHTML += html;
    }
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
    function type() {
        if (i < text.length) {
            if (text.charAt(i) === '\n') {
                element.innerHTML += '<br><br>';
                setTimeout(type, paragraphSpeed);
            } else {
                element.innerHTML += text.charAt(i);
                setTimeout(type, speed);
            }
            i++;
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

        // Check cache first (except for inspiration which should be fresh)
        if (mode !== 'inspiration') {
            const cacheKey = getCacheKey(userText, mode, context);
            if (responseCache.has(cacheKey)) {
                console.log('Using cached response for', mode);
                return responseCache.get(cacheKey);
            }
        }
        
        if (mode === 'editor_feedback') {
            prompt = `You are an editor in the StoryForge Guild. Your task is to provide structured, actionable feedback on a young writer's story.

Their story: "${userText}"

Analyze the story and return a JSON object containing an array of feedback items. Each item in the array should be an object with the following structure:
{
  "type": "string", // "praise", "suggestion", "grammar", or "question"
  "text": "string", // Your feedback message.
  "quote": "string" // An exact quote from the user's story that the feedback refers to.
}

- For "praise", highlight a specific part of the story that is well-written.
- For "suggestion", offer a way to improve a sentence or idea.
- For "grammar", point out a grammatical error and suggest a correction.
- For "question", ask a question to prompt the writer to think more deeply about their story.

Do not include any sign-off or conversational filler. The entire response must be a single JSON object.
`
        } else if (mode === 'editor_revision') {
            prompt = `You are the Editor reviewing the Intern's revised story.

Original: "${context}"
Revision: "${userText}"

${currentRevision >= maxRevisions - 1 ?
            'This is their final revision - be very encouraging and guide them to finish.' :
            'Provide brief, encouraging feedback on their improvements.'}

Respond with a JSON object with a "response" field containing your feedback. For example:
{
  "response": "This is a great improvement! I love how you added more detail to the dragon's roar. It feels much more powerful now."
}
`

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
prompt += `\n\n- Do NOT include any introductory phrases like "Here is your feedback:" or "Overall Positive Response:". Just provide the feedback directly.`;
prompt += `\n- Do NOT include the numbered list or bolded headings from these instructions in your response.`;
prompt += `\n- Ensure your response contains ONLY the story ideas, without any conversational filler.`;

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
prompt += `\n\n- Do NOT include any introductory phrases like "Here is your feedback:" or "Overall Positive Response:". Just provide the feedback directly.`;
prompt += `\n- Do NOT include the numbered list or bolded headings from these instructions in your response.`;
prompt += `\n- Ensure your response contains ONLY the story ideas, without any conversational filler.`;

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
prompt += `\n\n- Do NOT include any introductory phrases like "Here is your feedback:" or "Overall Positive Response:". Just provide the feedback directly.`;
prompt += `\n- Do NOT include the numbered list or bolded headings from these instructions in your response.`;
prompt += `\n- Ensure your response contains ONLY the story ideas, without any conversational filler.`;
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

Just provide the four sentences with labels - no other conversational text.`;
prompt += `\n\n- Do NOT include any introductory phrases like "Here is your feedback:" or "Overall Positive Response:". Just provide the feedback directly.`;
prompt += `\n- Do NOT include the numbered list or bolded headings from these instructions in your response.`;
prompt += `\n- Ensure your response contains ONLY the story ideas, without any conversational filler.`;
        } else if (mode === 'summarize_strengths') {
            prompt = `You are a caring, kind dwarf with a smile, an editor in the StoryForge Guild.

The Intern has decided they like their story as it is. Please provide a summary of what makes their story great and work well.

Their story: "${userText}"

Keep your tone consistently that of a caring, kind dwarf with a smile. Address them as "Intern" and sign as "Your friend, The Story-Dwarf".`
prompt += `\n\n- Do NOT include any introductory phrases like "Here is your feedback:" or "Overall Positive Response:". Just provide the feedback directly.`;
prompt += `\n- Do NOT include the numbered list or bolded headings from these instructions in your response.`;
prompt += `\n- Ensure your response contains ONLY the story ideas, without any conversational filler.`;
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
                        maxOutputTokens: mode === 'guild_story' ? 1500 : 500
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

        // Cache successful responses (except inspiration)
        if (mode !== 'inspiration') {
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
    const title = document.getElementById('storyTitle').value.trim() || 'My StoryForge Tale';
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
                <p>Created with StoryForge</p>
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
    const title = document.getElementById('storyTitle').value || 'My StoryForge Tale';
    const story = document.getElementById('finalStory').textContent;
    const content = `${title}\n\nForged with StoryForge\nWhere Stories Are Forged, Not Just Written\n\n${story}\n\nCreated by: ${currentUser}\nDate: ${new Date().toLocaleDateString()}`;
    
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
                <h1>StoryForge</h1>
                <p>Sorry, there was a problem loading the app. Please refresh the page and try again.</p>
                <button onclick="window.location.reload()">Reload Page</button>
            </div>
        `;
    }

    // Welcome page
    document.getElementById('newStoryChoice').addEventListener('click', () => {
        showPage('newStoryOptionsPage');
    });

    document.getElementById('oldStoryChoice').addEventListener('click', () => {
        showPage('libraryPage');
        loadLibrary();
    });

    // New Story Options page
    document.getElementById('haveIdea').addEventListener('click', () => {
        showPage('editorPage');
    });

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

    document.getElementById('needsInspiration').addEventListener('click', generateAndDisplayInspiration);

    // Add event listener for "Show me other ideas" button
    document.getElementById('generateMoreInspiration').addEventListener('click', generateAndDisplayInspiration);

    // Event listener for "Start Writing" button
    document.getElementById('startWithInspiration').addEventListener('click', () => {
        if (selectedInspirationText) {
            // Set the selected inspiration as the story
            document.getElementById('editableStory').value = selectedInspirationText;
            showPage('editorPage');
        } else {
            alert('Please select an idea first!');
        }
    });

    // Workshop page
    document.getElementById('getEditorFeedback').addEventListener('click', async () => {
        const story = document.getElementById('storyInput').value.trim();
        if (!story) {
            alert('Please write your story first!');
            return;
        }
        
        currentStory = story;
        currentRevision = 0;
        document.getElementById('editableStory').value = story;
        
        const feedbackContainer = document.getElementById('feedbackContainer');
        feedbackContainer.innerHTML = '<div class="loading">Your Editor is reviewing your story...</div>';
        
        showPage('editorPage');
        
        const feedbackJSON = await callStoryForgeAI(story, 'editor_feedback');
        
        try {
            // Strip markdown code blocks before parsing JSON
            const cleanJSON = feedbackJSON.replace(/```json\s*|\s*```/g, '').trim();
            const feedback = JSON.parse(cleanJSON);
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
        } catch (error) {
            console.error('Error parsing feedback JSON:', error);
            feedbackContainer.innerHTML = '<div class="error-message">There was an issue getting feedback. Please try again.</div>';
        }
    });

    document.getElementById('backToDashboard').addEventListener('click', () => {
        showPage('libraryPage');
        loadLibrary();
    });

    // Editor page
    document.getElementById('submitRevision').addEventListener('click', async () => {
        const revisedStory = document.getElementById('editableStory').value.trim();
        if (!revisedStory) {
            alert('Please revise your story!');
            return;
        }

        currentRevision++;
        const feedbackContainer = document.getElementById('feedbackContainer');
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
            document.getElementById('likeAsIs').style.display = 'block';
        }

        if (currentRevision >= maxRevisions) {
            document.getElementById('acceptStory').textContent = 'Move to Guild!';
        }
    });

    document.getElementById('acceptStory').addEventListener('click', () => {
        currentStory = document.getElementById('editableStory').value.trim();
        showPage('guildPage');
    });

    document.getElementById('likeAsIs').addEventListener('click', async () => {
        const story = document.getElementById('editableStory').value.trim();
        const summary = await callStoryForgeAI(story, 'summarize_strengths');
        const responseDiv = document.getElementById('editorResponse');
        const p = document.createElement('p');
        responseDiv.innerHTML = '';
        responseDiv.appendChild(p)
        typeWriter(p, summary);
        document.getElementById('editorButtons').style.display = 'none';
    });

    // Guild page
    document.getElementById('allowCollaboration').addEventListener('click', async () => {
        document.getElementById('guildChoice').style.display = 'none';
        document.getElementById('guildStorySection').style.display = 'block';
        
        guildRevisionCount = 0;
        const guildStoryDiv = document.getElementById('guildStory');
        guildStoryDiv.innerHTML = '<div class="loading">The Guild writer is crafting their version...</div>';

        const guildStory = await callStoryForgeAI(currentStory, 'guild_story');
        currentGuildStory = guildStory;
        typeWriter(guildStoryDiv, guildStory);
    });

    document.getElementById('declineCollaboration').addEventListener('click', () => {
        displayFormattedStory('finalStory', currentStory);
        showPage('successPage');
    });

    document.getElementById('submitFeedback').addEventListener('click', async () => {
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
            document.getElementById('approveFinalStory').textContent = 'Finish Story!';
        }
    });

    document.getElementById('approveFinalStory').addEventListener('click', () => {
        displayFormattedStory('finalStory', currentGuildStory);
        showPage('successPage');
    });

    // Success page
    document.getElementById('saveStory').addEventListener('click', () => {
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

    document.getElementById('downloadStory').addEventListener('click', downloadStory);

    document.getElementById('createAnother').addEventListener('click', () => {
        // Reset story state
        currentStory = '';
        currentGuildStory = '';
        currentRevision = 0;
        guildRevisionCount = 0;
        document.getElementById('storyInput').value = '';
        showPage('workshopPage');
    });

    document.getElementById('viewLibrary').addEventListener('click', () => {
        showPage('libraryPage');
        loadLibrary();
    });

    // Illustrated book functionality
    document.getElementById('createIllustratedBook').addEventListener('click', createIllustratedBook);
    
    document.getElementById('prevPage').addEventListener('click', () => {
        if (currentPageIndex > 0) {
            showBookPage(currentPageIndex - 1);
        }
    });
    
    document.getElementById('nextPage').addEventListener('click', () => {
        if (currentPageIndex < illustratedPages.length - 1) {
            showBookPage(currentPageIndex + 1);
        }
    });
    
    document.getElementById('backToStory').addEventListener('click', () => {
        showPage('successPage');
    });
    
   document.getElementById('downloadIllustratedBook').addEventListener('click', () => {
   downloadIllustratedBookAsPDF();
    });

    // Library page
    document.getElementById('newStoryButton').addEventListener('click', () => {
        document.getElementById('storyInput').value = '';
        showPage('workshopPage');
    });

    document.getElementById('clearLibraryButton').addEventListener('click', clearLibrary);

    // Story Reader Page
    document.getElementById('prevStoryPage').addEventListener('click', () => {
        if (storyReaderInfo.currentPage > 0) {
            storyReaderInfo.currentPage--;
            showStoryReaderPage();
        }
    });

    document.getElementById('nextStoryPage').addEventListener('click', () => {
        if (storyReaderInfo.currentPage < storyReaderInfo.paragraphs.length - 1) {
            storyReaderInfo.currentPage++;
            showStoryReaderPage();
        }
    });

    document.getElementById('backToLibraryFromReader').addEventListener('click', () => {
        showPage('libraryPage');
    });
});
