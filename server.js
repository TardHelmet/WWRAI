const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Serve static files from current directory (where index.html is)
app.use(express.static(__dirname));

// Get API key from environment variable (secure!)
const GEMINI_KEY = process.env.GEMINI_API_KEY;

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Watch.Right.Android POC Server Running!',
        timestamp: new Date().toISOString(),
        apiKeyConfigured: !!GEMINI_KEY
    });
});

// Test Gemini API endpoint
app.get('/test-gemini', async (req, res) => {
    try {
        console.log('Testing Gemini API...');
        console.log('API Key configured:', !!GEMINI_KEY);
        
        if (!GEMINI_KEY) {
            return res.json({ error: 'No API key configured' });
        }
        
        const testResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: "Hello, respond with just 'API working'" }]
                    }]
                })
            }
        );
        
        console.log('Gemini response status:', testResponse.status);
        const result = await testResponse.text();
        
        res.json({ 
            status: testResponse.status, 
            result: result.substring(0, 500),
            keyConfigured: !!GEMINI_KEY 
        });
        
    } catch (error) {
        console.error('Gemini test error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Secure API endpoint for Gemini calls (SINGLE VERSION - NO DUPLICATES)
app.post('/api/editor', async (req, res) => {
    try {
        // Check if API key is configured
        if (!GEMINI_KEY) {
            console.error('API key not configured');
            return res.status(500).json({ 
                error: 'API key not configured. Please set GEMINI_API_KEY environment variable.' 
            });
        }

        console.log('Making Gemini API call...');
        console.log('Request body received:', JSON.stringify(req.body, null, 2));
        
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_KEY}`,
            {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'User-Agent': 'WatchRightAndroid/1.0'
                },
                body: JSON.stringify(req.body)
            }
        );

        console.log('Gemini API response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini API Error:', response.status, errorText);
            return res.status(response.status).json({ 
                error: `Gemini API error: ${response.status}`,
                details: errorText
            });
        }

        const data = await response.json();
        console.log('Gemini API call successful');
        console.log('Response data:', JSON.stringify(data, null, 2));
        
        res.json(data);
        
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
});

// Serve index.html for all other routes (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`🚀 Watch.Right.Android POC Server running on port ${port}`);
    console.log(`📝 Visit your app at: http://localhost:${port}`);
    console.log(`🔑 API Key configured: ${GEMINI_KEY ? 'YES' : 'NO'}`);
    console.log(`📁 Serving files from: ${__dirname}`);
});