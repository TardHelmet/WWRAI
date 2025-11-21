const express = require('express');
const path = require('path');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// Middleware - Compression
app.use(compression());

// Middleware - Static files with caching
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1d', // Cache for 1 day
    etag: true,
    lastModified: true
}));

// Middleware - JSON parsing
app.use(express.json({ limit: '10mb' }));

// Rate limiters
const aiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 requests per minute
    message: { 
        error: 'Too many AI requests, please try again in a minute!',
        hint: 'The StoryForge Guild appreciates your enthusiasm, but take a breath!'
    },
    standardHeaders: true,
    legacyHeaders: false
});

const imageLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10, // 10 requests per 5 minutes
    message: { 
        error: 'Too many image generation requests, please wait before creating more illustrations.',
        hint: 'Illustrations take time to forge!'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Set cache headers for API responses
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        res.set('Cache-Control', 'no-store'); // Don't cache API responses
    }
    next();
});

// Get API keys from environment variables
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        message: 'StoryForge is ready to forge stories!',
        timestamp: new Date().toISOString(),
        apiKeyConfigured: !!GEMINI_KEY,
        tagline: 'Where Stories Are Forged, Not Just Written'
    });
});

// StoryForge AI endpoint for all creative writing assistance (using Claude)
app.post('/api/storyforge-ai', aiLimiter, async (req, res) => {
    try {
        // Check if API key is configured
        if (!ANTHROPIC_KEY) {
            console.error('❌ ANTHROPIC_API_KEY not configured');
            return res.status(500).json({
                error: 'AI service not configured. Please set ANTHROPIC_API_KEY environment variable.',
                hint: 'The StoryForge Guild needs an API key to connect with our AI mentors!'
            });
        }

        console.log('🎭 StoryForge AI request received');
        console.log('📝 Request payload:', JSON.stringify(req.body, null, 2));

        // Extract the prompt from the Gemini-style request format
        const prompt = req.body.contents?.[0]?.parts?.[0]?.text || '';
        const maxTokens = req.body.generationConfig?.maxOutputTokens || 1024;
        const temperature = req.body.generationConfig?.temperature || 0.8;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_KEY,
                'anthropic-version': '2023-06-01',
                'User-Agent': 'StoryForge/1.0 - Where Stories Are Forged'
            },
            body: JSON.stringify({
                model: 'claude-3-5-haiku-20241022',
                max_tokens: maxTokens,
                temperature: temperature,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            })
        });

        console.log('🤖 Claude API response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Claude API Error:', response.status, errorText);
            return res.status(response.status).json({
                error: `AI service error: ${response.status}`,
                details: errorText,
                message: 'The StoryForge Guild is having trouble connecting. Please try again!'
            });
        }

        const data = await response.json();
        console.log('✅ StoryForge AI call successful');

        // Log the response for debugging (truncated)
        const responseText = data.content?.[0]?.text;
        if (responseText) {
            console.log('📖 AI Response preview:', responseText.substring(0, 150) + '...');
        }

        // Transform Claude response to match Gemini format for frontend compatibility
        const transformedResponse = {
            candidates: [
                {
                    content: {
                        parts: [
                            {
                                text: responseText || ''
                            }
                        ]
                    }
                }
            ]
        };

        res.json(transformedResponse);

    } catch (error) {
        console.error('💥 StoryForge server error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
            hint: 'The StoryForge Guild is experiencing technical difficulties. Please try again!'
        });
    }
});

// Image generation endpoint using Gemini 2.0 Flash Image Generation
app.post('/api/generate-image', imageLimiter, async (req, res) => {
    try {
        const { prompt, pageNumber } = req.body;

        console.log(`🎨 Generating image ${pageNumber} with Gemini 2.0 Flash...`);
        console.log(`📝 Prompt preview:`, prompt.substring(0, 150) + '...');

        if (!GEMINI_KEY) {
            console.error('❌ GEMINI_API_KEY not configured');
            return res.status(200).json({
                success: false,
                error: 'Gemini API key not configured',
                pageNumber,
                imageUrl: null
            });
        }

        // Using Gemini 2.0 Flash Experimental Image Generation
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_KEY}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'StoryForge/1.0 - Image Generation'
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        responseModalities: ["TEXT", "IMAGE"],
                        temperature: 0.7
                    }
                })
            }
        );

        console.log(`🎨 Gemini Image API response status for page ${pageNumber}:`, response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Gemini Image API Error for page ${pageNumber}:`, response.status, errorText);

            return res.status(200).json({
                success: false,
                error: `Gemini image generation failed: ${response.status}`,
                pageNumber,
                imageUrl: null,
                debugInfo: errorText.substring(0, 200)
            });
        }

        const data = await response.json();
        console.log(`📊 Gemini response structure for page ${pageNumber}:`, Object.keys(data));

        // Look for image data in the response
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
            const parts = data.candidates[0].content.parts;

            // Find the image part
            const imagePart = parts.find(part => part.inlineData && part.inlineData.data);

            if (imagePart) {
                const imageBase64 = imagePart.inlineData.data;
                const mimeType = imagePart.inlineData.mimeType || 'image/png';
                const imageUrl = `data:${mimeType};base64,${imageBase64}`;

                console.log(`✅ Successfully generated image ${pageNumber} (${mimeType})`);

                return res.json({
                    success: true,
                    imageUrl: imageUrl,
                    pageNumber: pageNumber,
                    mimeType: mimeType
                });
            }
        }

        // If we get here, no image was found in the response
        console.error(`❌ No image data found in Gemini response for page ${pageNumber}`);
        console.log(`🔍 Full response structure:`, JSON.stringify(data, null, 2));

        return res.status(200).json({
            success: false,
            error: 'No image data found in Gemini response',
            pageNumber,
            imageUrl: null,
            debugInfo: `Response had ${data.candidates?.length || 0} candidates with ${data.candidates?.[0]?.content?.parts?.length || 0} parts`
        });

    } catch (error) {
        console.error(`💥 Gemini image generation error for page ${req.body.pageNumber}:`, error);
        return res.status(200).json({
            success: false,
            error: error.message,
            pageNumber: req.body.pageNumber,
            imageUrl: null,
            debugInfo: error.stack?.substring(0, 300)
        });
    }
});

// Test endpoint for Gemini image generation
app.get('/api/test-image', async (req, res) => {
    try {
        console.log('🧪 Testing Gemini 2.0 Flash Image Generation...');

        if (!GEMINI_KEY) {
            return res.json({
                error: 'No API key configured',
                configured: false
            });
        }

        const testPrompt = "Children's book illustration, simple drawing style. A happy orange cat with white paws sitting in a sunny garden. Friendly and colorful, suitable for children.";

        const testResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: testPrompt }] }],
                    generationConfig: {
                        responseModalities: ["TEXT", "IMAGE"],
                        temperature: 0.7
                    }
                })
            }
        );

        console.log('🧪 Test image response status:', testResponse.status);

        if (testResponse.ok) {
            const data = await testResponse.json();
            const hasImage = data.candidates?.[0]?.content?.parts?.some(part => part.inlineData);

            res.json({
                status: testResponse.status,
                configured: true,
                working: true,
                hasImage: hasImage,
                message: hasImage ? 'Gemini Image Generation is working!' : 'API responded but no image found',
                candidatesCount: data.candidates?.length || 0,
                partsCount: data.candidates?.[0]?.content?.parts?.length || 0
            });
        } else {
            const errorText = await testResponse.text();
            res.json({
                status: testResponse.status,
                configured: true,
                working: false,
                error: errorText.substring(0, 200),
                message: 'Gemini Image API connection issues'
            });
        }

    } catch (error) {
        console.error('🧪 Image test error:', error);
        res.status(500).json({
            error: error.message,
            configured: !!GEMINI_KEY,
            working: false
        });
    }
});

// Test endpoint for AI connectivity
app.get('/api/test-ai', async (req, res) => {
    try {
        console.log('🧪 Testing StoryForge AI connection (Claude)...');

        if (!ANTHROPIC_KEY) {
            return res.json({
                error: 'No API key configured',
                configured: false,
                message: 'Set ANTHROPIC_API_KEY environment variable'
            });
        }

        const testResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-5-haiku-20241022',
                max_tokens: 100,
                messages: [
                    {
                        role: 'user',
                        content: "Say 'StoryForge AI is working!' and nothing else."
                    }
                ]
            })
        });

        console.log('🧪 Test response status:', testResponse.status);
        const data = await testResponse.json();
        const result = data.content?.[0]?.text || '';

        res.json({
            status: testResponse.status,
            configured: true,
            working: testResponse.ok,
            response: result.substring(0, 200),
            message: testResponse.ok ? 'StoryForge AI is ready!' : 'AI connection issues'
        });

    } catch (error) {
        console.error('🧪 AI test error:', error);
        res.status(500).json({
            error: error.message,
            configured: !!ANTHROPIC_KEY,
            working: false
        });
    }
});

// Story endpoints for future expansion (currently using localStorage in frontend)
app.get('/api/stories/user/:userId', (req, res) => {
    // Future: Database integration for user stories
    res.json({
        message: 'Stories are currently stored locally in your browser',
        user: req.params.userId,
        stories: []
    });
});

app.post('/api/stories', (req, res) => {
    // Future: Save stories to database
    const { title, originalStory, finalStory, userId } = req.body;
    console.log('📚 Story save request:', { title, userId, hasOriginal: !!originalStory, hasFinal: !!finalStory });

    res.json({
        success: true,
        message: 'Story saved locally! (Server storage coming soon)',
        id: Date.now().toString()
    });
});

// Analytics endpoints for production monitoring
app.post('/api/analytics/story-event', (req, res) => {
    const { event, userId, storyId, metadata } = req.body;
    console.log('📊 Story event:', event, { userId, storyId, metadata });

    // Future: Track user engagement for improvement
    res.json({ recorded: true });
});

app.post('/api/analytics/error', (req, res) => {
    const errorData = req.body;
    
    // Log error with timestamp
    console.error('🚨 Production Error:', {
        message: errorData.message,
        context: errorData.context,
        userId: errorData.userId,
        timestamp: errorData.timestamp,
        url: errorData.url,
        isOnline: errorData.isOnline,
        userAgent: errorData.userAgent?.substring(0, 100) // Truncate long user agents
    });

    // Future: Send to error tracking service (Sentry, LogRocket, etc.)
    res.json({ logged: true });
});

app.post('/api/analytics/performance', (req, res) => {
    const performanceData = req.body;
    
    // Log performance metrics
    console.log('⚡ Performance:', {
        event: performanceData.event,
        data: performanceData.data,
        userId: performanceData.userId,
        isMobile: performanceData.isMobile,
        isOnline: performanceData.isOnline,
        timestamp: performanceData.timestamp
    });

    // Future: Send to analytics service (Google Analytics, Mixpanel, etc.)
    res.json({ tracked: true });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('💥 Unhandled error:', err);
    res.status(500).json({
        error: 'Something went wrong in the StoryForge Guild!',
        message: 'Please try again or contact support.'
    });
});

// Serve index.html for all other routes (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(port, () => {
    console.log('🏰 ============================================');
    console.log('🏰 StoryForge Guild Server is now active!');
    console.log('🏰 ============================================');
    console.log(`📖 Tagline: "Where Stories Are Forged, Not Just Written"`);
    console.log(`🌐 Guild Portal: http://localhost:${port}`);
    console.log(`🔑 API Key configured: ${GEMINI_KEY ? '✅ YES' : '❌ NO'} (starts with: ${GEMINI_KEY ? GEMINI_KEY.substring(0, 5) + '...' : 'N/A'})`);
    console.log(`📁 Serving files from: ${__dirname}`);
    console.log(`⚡ Ready to help Interns forge amazing stories!`);
    console.log('🏰 ============================================');

    if (!GEMINI_KEY) {
        console.log('⚠️  WARNING: Set GEMINI_API_KEY environment variable for AI features');
    }
});
