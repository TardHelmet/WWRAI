const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Get API key from environment variable (secure!)
const GEMINI_KEY = process.env.GEMINI_API_KEY;

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Watch.Right.Android POC Server Running!' });
});

// Secure API endpoint for Gemini calls
app.post('/api/editor', async (req, res) => {
    try {
        // Check if API key is configured
        if (!GEMINI_KEY) {
            return res.status(500).json({ 
                error: 'API key not configured. Please set GEMINI_API_KEY environment variable.' 
            });
        }

        console.log('Making Gemini API call...');
        
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
        
        res.json(data);
        
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
});

// Catch-all handler for SPA
app.get('*', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.listen(port, () => {
    console.log(`🚀 Watch.Right.Android POC Server running on port ${port}`);
    console.log(`📝 Visit your app at: http://localhost:${port}`);
    console.log(`🔑 API Key configured: ${GEMINI_KEY ? 'YES' : 'NO'}`);
});
