const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// Get API key from environment variable
const GEMINI_KEY = process.env.GEMINI_API_KEY;

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

// StoryForge AI endpoint for all creative writing assistance
app.post('/api/storyforge-ai', async (req, res) => {
    try {
        // Check if API key is configured
        if (!GEMINI_KEY) {
            console.error('❌ GEMINI_API_KEY not configured');
            return res.status(500).json({
                error: 'AI service not configured. Please set GEMINI_API_KEY environment variable.',
                hint: 'The StoryForge Guild needs an API key to connect with our AI mentors!'
            });
        }

        console.log('🎭 StoryForge AI request received');
        console.log('📝 Request payload:', JSON.stringify(req.body, null, 2));

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'StoryForge/1.0 - Where Stories Are Forged'
                },
                body: JSON.stringify(req.body)
            }
        );

        console.log('🤖 Gemini API response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Gemini API Error:', response.status, errorText);
            return res.status(response.status).json({
                error: `AI service error: ${response.status}`,
                details: errorText,
                message: 'The StoryForge Guild is having trouble connecting. Please try again!'
            });
        }

        const data = await response.json();
        console.log('✅ StoryForge AI call successful');

        // Log the response for debugging (truncated)
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (responseText) {
            console.log('📖 AI Response preview:', responseText.substring(0, 150) + '...');
        }

        res.json(data);

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
app.post('/api/generate-image', async (req, res) => {
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

        // Using Gemini 2.0 Flash Preview Image Generation
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${GEMINI_KEY}`,
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
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${GEMINI_KEY}`,
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
        console.log('🧪 Testing StoryForge AI connection...');

        if (!GEMINI_KEY) {
            return res.json({
                error: 'No API key configured',
                configured: false,
                message: 'Set GEMINI_API_KEY environment variable'
            });
        }

        const testResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: "Say 'StoryForge AI is working!' and nothing else." }] }]
                })
            }
        );

        console.log('🧪 Test response status:', testResponse.status);
        const result = await testResponse.text();

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
            configured: !!GEMINI_KEY,
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

// Analytics endpoint for future use
app.post('/api/analytics/story-event', (req, res) => {
    const { event, userId, storyId, metadata } = req.body;
    console.log('📊 Story event:', event, { userId, storyId, metadata });

    // Future: Track user engagement for improvement
    res.json({ recorded: true });
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
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(port, () => {
    console.log('🏰 ============================================');
    console.log('🏰 StoryForge Guild Server is now active!');
    console.log('🏰 ============================================');
    console.log(`📖 Tagline: "Where Stories Are Forged, Not Just Written"`);
    console.log(`🌐 Guild Portal: http://localhost:${port}`);
    console.log(`🔑 API Key configured: ${GEMINI_KEY ? '✅ YES' : '❌ NO'}`);
    console.log(`📁 Serving files from: ${__dirname}`);
    console.log(`⚡ Ready to help Interns forge amazing stories!`);
    console.log('🏰 ============================================');

    if (!GEMINI_KEY) {
        console.log('⚠️  WARNING: Set GEMINI_API_KEY environment variable for AI features');
    }
});
