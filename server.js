const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } = require('@simplewebauthn/server');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// Get API key from environment variable
const GEMINI_KEY = process.env.GEMINI_API_KEY;

// Initialize SQLite database
const db = new sqlite3.Database('./stories.db');

// Create tables
db.serialize(() => {
    // Users table (minimal data - just first name and passkey info)
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        first_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Passkey credentials table
    db.run(`CREATE TABLE IF NOT EXISTS user_credentials (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        credential_id TEXT,
        credential_public_key TEXT,
        counter INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
    
    // Stories table
    db.run(`CREATE TABLE IF NOT EXISTS stories (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        title TEXT,
        original_story TEXT,
        ai_edited_story TEXT,
        video_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
});

// WebAuthn configuration
const rpName = 'Watch.Right.Android';
const rpID = process.env.NODE_ENV === 'production' ? 'wwrai.onrender.com' : 'localhost';
const origin = process.env.NODE_ENV === 'production' ? 'https://wwrai.onrender.com' : `http://localhost:${port}`;

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Watch.Right.Android POC Server Running!',
        timestamp: new Date().toISOString(),
        apiKeyConfigured: !!GEMINI_KEY,
        database: 'Connected'
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
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
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

// Authentication Routes

// Start passkey registration
app.post('/api/auth/register/begin', async (req, res) => {
    try {
        const { firstName } = req.body;
        
        if (!firstName || firstName.trim().length < 1) {
            return res.status(400).json({ error: 'First name is required' });
        }
        
        const userId = uuidv4();
        const userName = firstName.trim();
        
        const options = generateRegistrationOptions({
            rpName,
            rpID,
            userID: userId,
            userName: userName,
            userDisplayName: userName,
            attestationType: 'none',
            authenticatorSelection: {
                authenticatorAttachment: 'platform',
                userVerification: 'preferred',
            },
        });
        
        // Store challenge temporarily (in production, use Redis or session store)
        global.challenges = global.challenges || {};
        global.challenges[userId] = options.challenge;
        
        res.json({ options, userId });
        
    } catch (error) {
        console.error('Registration begin error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Complete passkey registration
app.post('/api/auth/register/complete', async (req, res) => {
    try {
        const { userId, firstName, credential } = req.body;
        
        const expectedChallenge = global.challenges?.[userId];
        if (!expectedChallenge) {
            return res.status(400).json({ error: 'Invalid or expired challenge' });
        }
        
        const verification = await verifyRegistrationResponse({
            response: credential,
            expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
        });
        
        if (verification.verified && verification.registrationInfo) {
            // Save user to database
            db.run('INSERT INTO users (id, first_name) VALUES (?, ?)', 
                [userId, firstName.trim()], function(err) {
                if (err) {
                    console.error('Database error saving user:', err);
                    return res.status(500).json({ error: 'Failed to save user' });
                }
                
                // Save credential
                const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;
                
                db.run(`INSERT INTO user_credentials 
                    (id, user_id, credential_id, credential_public_key, counter) 
                    VALUES (?, ?, ?, ?, ?)`, 
                    [uuidv4(), userId, Buffer.from(credentialID).toString('base64'), 
                     Buffer.from(credentialPublicKey).toString('base64'), counter], 
                    function(err) {
                    if (err) {
                        console.error('Database error saving credential:', err);
                        return res.status(500).json({ error: 'Failed to save credential' });
                    }
                    
                    // Clean up challenge
                    delete global.challenges[userId];
                    
                    res.json({ 
                        verified: true, 
                        user: { id: userId, firstName: firstName.trim() } 
                    });
                });
            });
        } else {
            res.status(400).json({ error: 'Registration verification failed' });
        }
        
    } catch (error) {
        console.error('Registration complete error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Start passkey authentication
app.post('/api/auth/login/begin', async (req, res) => {
    try {
        const options = generateAuthenticationOptions({
            rpID,
            userVerification: 'preferred',
        });
        
        // Store challenge temporarily
        global.authChallenges = global.authChallenges || {};
        global.authChallenges[options.challenge] = true;
        
        res.json(options);
        
    } catch (error) {
        console.error('Login begin error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Complete passkey authentication
app.post('/api/auth/login/complete', async (req, res) => {
    try {
        const { credential } = req.body;
        
        const credentialId = Buffer.from(credential.id, 'base64url').toString('base64');
        
        // Find user by credential
        db.get(`SELECT u.id, u.first_name, c.credential_public_key, c.counter 
                FROM users u 
                JOIN user_credentials c ON u.id = c.user_id 
                WHERE c.credential_id = ?`, 
                [credentialId], async (err, row) => {
            if (err || !row) {
                return res.status(400).json({ error: 'User not found' });
            }
            
            try {
                const verification = await verifyAuthenticationResponse({
                    response: credential,
                    expectedChallenge: credential.response.clientDataJSON ? 
                        JSON.parse(Buffer.from(credential.response.clientDataJSON, 'base64url').toString()).challenge : '',
                    expectedOrigin: origin,
                    expectedRPID: rpID,
                    authenticator: {
                        credentialID: Buffer.from(credentialId, 'base64'),
                        credentialPublicKey: Buffer.from(row.credential_public_key, 'base64'),
                        counter: row.counter,
                    },
                });
                
                if (verification.verified) {
                    res.json({ 
                        verified: true, 
                        user: { id: row.id, firstName: row.first_name } 
                    });
                } else {
                    res.status(400).json({ error: 'Authentication failed' });
                }
                
            } catch (verifyError) {
                console.error('Verification error:', verifyError);
                res.status(400).json({ error: 'Authentication verification failed' });
            }
        });
        
    } catch (error) {
        console.error('Login complete error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Story Management Routes

// Save a story
app.post('/api/stories', (req, res) => {
    try {
        const { userId, title, originalStory, aiEditedStory, videoUrl } = req.body;
        
        if (!userId || !originalStory) {
            return res.status(400).json({ error: 'User ID and original story are required' });
        }
        
        const storyId = uuidv4();
        
        db.run(`INSERT INTO stories 
            (id, user_id, title, original_story, ai_edited_story, video_url) 
            VALUES (?, ?, ?, ?, ?, ?)`, 
            [storyId, userId, title || 'My Story', originalStory, aiEditedStory || '', videoUrl || ''], 
            function(err) {
            if (err) {
                console.error('Database error saving story:', err);
                return res.status(500).json({ error: 'Failed to save story' });
            }
            
            res.json({ 
                success: true, 
                storyId, 
                message: 'Story saved successfully!' 
            });
        });
        
    } catch (error) {
        console.error('Save story error:', error);
        res.status(500).json({ error: 'Failed to save story' });
    }
});

// Get user's stories
app.get('/api/stories/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        
        db.all(`SELECT id, title, original_story, ai_edited_story, video_url, created_at, updated_at 
                FROM stories 
                WHERE user_id = ? 
                ORDER BY created_at DESC`, 
                [userId], (err, rows) => {
            if (err) {
                console.error('Database error getting stories:', err);
                return res.status(500).json({ error: 'Failed to get stories' });
            }
            
            res.json({ stories: rows || [] });
        });
        
    } catch (error) {
        console.error('Get stories error:', error);
        res.status(500).json({ error: 'Failed to get stories' });
    }
});

// Secure API endpoint for Gemini calls
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
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
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
    console.log(`🗄️  Database initialized`);
    console.log(`🔒 WebAuthn configured for: ${rpID}`);
    console.log(`📁 Serving files from: ${__dirname}`);
});