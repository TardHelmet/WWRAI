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

// Test endpoint for API connectivity
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
                    contents: [{
                        parts: [{ text: "Say 'StoryForge AI is working!' and nothing else." }]
                    }]
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
