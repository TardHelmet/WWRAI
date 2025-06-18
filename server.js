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
const db = new sqlite3.Database('./storyforge.db');

// Create tables
db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        first_name TEXT NOT NULL,
        guild_level TEXT DEFAULT 'Intern',
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
        story_type TEXT DEFAULT 'video_inspired',
        mentor_feedback TEXT,
        guild_enhanced BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
});

// WebAuthn configuration
const rpName = 'StoryForge';
const rpID = process.env.NODE_ENV === 'production' ? 'wwrai.onrender.com' : 'localhost';
const origin = process.env.NODE_ENV === 'production' ? 'https://wwrai.onrender.com' : `http://localhost:${port}`;

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'StoryForge Guild Server Running!',
        tagline: 'Forge Your Own Epic. Learn to Write, One Story at a Time.',
        timestamp: new Date().toISOString(),
        apiKeyConfigured: !!GEMINI_KEY,
        database: 'Connected',
        guildStatus: 'Active'
    });
});

// Test Gemini API endpoint
app.get('/test-gemini', async (req, res) => {
    try {
        console.log('Testing StoryForge AI Mentor...');
        
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
                        parts: [{ text: "You are a Writing Mentor at StoryForge. Respond with just 'StoryForge Guild Ready!'" }]
                    }]
                })
            }
        );
        
        const result = await testResponse.text();
        
        res.json({ 
            status: testResponse.status, 
            result: result.substring(0, 500),
            keyConfigured: !!GEMINI_KEY,
            service: 'StoryForge AI Mentor'
        });
        
    } catch (error) {
        console.error('StoryForge AI test error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start passkey registration
app.post('/api/auth/register/begin', async (req, res) => {
    try {
        const { firstName } = req.body;
        
        if (!firstName || firstName.trim().length < 1) {
            return res.status(400).json({ error: 'Name is required to join the Guild' });
        }
        
        if (firstName.trim().length > 50) {
            return res.status(400).json({ error: 'Name is too long for Guild records' });
        }
        
        const userId = uuidv4();
        const userName = firstName.trim();
        
        const options = generateRegistrationOptions({
            rpName,
            rpID,
            userID: userId,
            userName: userName,
            userDisplayName: `${userName} - Storymaker Intern`,
            attestationType: 'none',
            authenticatorSelection: {
                authenticatorAttachment: 'platform',
                userVerification: 'preferred',
            },
        });
        
        // Store challenge temporarily
        global.challenges = global.challenges || {};
        global.challenges[userId] = options.challenge;
        
        res.json({ options, userId });
        
    } catch (error) {
        console.error('Guild registration begin error:', error);
        res.status(500).json({ error: 'Failed to begin Guild registration' });
    }
});

// Complete passkey registration
app.post('/api/auth/register/complete', async (req, res) => {
    try {
        const { userId, firstName, credential } = req.body;
        
        const expectedChallenge = global.challenges?.[userId];
        if (!expectedChallenge) {
            return res.status(400).json({ error: 'Invalid or expired Guild challenge' });
        }
        
        const verification = await verifyRegistrationResponse({
            response: credential,
            expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
        });
        
        if (verification.verified && verification.registrationInfo) {
            // Save user to database
            db.run('INSERT INTO users (id, first_name, guild_level) VALUES (?, ?, ?)', 
                [userId, firstName.trim(), 'Intern'], function(err) {
                if (err) {
                    console.error('Database error saving Guild member:', err);
                    return res.status(500).json({ error: 'Failed to register with Guild' });
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
                        console.error('Database error saving Guild credentials:', err);
                        return res.status(500).json({ error: 'Failed to save Guild credentials' });
                    }
                    
                    // Clean up challenge
                    delete global.challenges[userId];
                    
                    res.json({ 
                        verified: true, 
                        user: { 
                            id: userId, 
                            firstName: firstName.trim(),
                            guildLevel: 'Intern'
                        } 
                    });
                });
            });
        } else {
            res.status(400).json({ error: 'Guild registration verification failed' });
        }
        
    } catch (error) {
        console.error('Guild registration complete error:', error);
        res.status(500).json({ error: 'Guild registration failed' });
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
        console.error('Guild login begin error:', error);
        res.status(500).json({ error: 'Failed to begin Guild login' });
    }
});

// Complete passkey authentication
app.post('/api/auth/login/complete', async (req, res) => {
    try {
        const { credential } = req.body;
        
        const credentialId = Buffer.from(credential.id, 'base64url').toString('base64');
        
        // Find user by credential
        db.get(`SELECT u.id, u.first_name, u.guild_level, c.credential_public_key, c.counter 
                FROM users u 
                JOIN user_credentials c ON u.id = c.user_id 
                WHERE c.credential_id = ?`, 
                [credentialId], async (err, row) => {
            if (err || !row) {
                return res.status(400).json({ error: 'Guild member not found' });
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
                        user: { 
                            id: row.id, 
                            firstName: row.first_name,
                            guildLevel: row.guild_level || 'Intern'
                        } 
                    });
                } else {
                    res.status(400).json({ error: 'Guild authentication failed' });
                }
                
            } catch (verifyError) {
                console.error('Guild verification error:', verifyError);
                res.status(400).json({ error: 'Guild authentication verification failed' });
            }
        });
        
    } catch (error) {
        console.error('Guild login complete error:', error);
        res.status(500).json({ error: 'Guild login failed' });
    }
});

// Save a story
app.post('/api/stories', (req, res) => {
    try {
        const { userId, title, originalStory, aiEditedStory, videoUrl, mentorFeedback, guildEnhanced } = req.body;
        
        if (!userId || !originalStory) {
            return res.status(400).json({ error: 'User ID and story are required' });
        }
        
        const storyId = uuidv4();
        const storyTitle = title || 'My Story';
        
        db.run(`INSERT INTO stories 
            (id, user_id, title, original_story, ai_edited_story, video_url, mentor_feedback, guild_enhanced) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
            [storyId, userId, storyTitle, originalStory, aiEditedStory || '', videoUrl || '', 
             mentorFeedback || '', guildEnhanced ? 1 : 0], 
            function(err) {
            if (err) {
                console.error('Database error saving story to Guild library:', err);
                return res.status(500).json({ error: 'Failed to save story to Guild library' });
            }
            
            res.json({ 
                success: true, 
                storyId, 
                message: 'Story forged and saved to your library!' 
            });
        });
        
    } catch (error) {
        console.error('Save story error:', error);
        res.status(500).json({ error: 'Failed to forge story' });
    }
});

// Get user's stories
app.get('/api/stories/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        
        db.all(`SELECT id, title, original_story, ai_edited_story, video_url, 
                mentor_feedback, guild_enhanced, created_at, updated_at 
                FROM stories 
                WHERE user_id = ? 
                ORDER BY created_at DESC`, 
                [userId], (err, rows) => {
            if (err) {
                console.error('Database error getting Guild library:', err);
                return res.status(500).json({ error: 'Failed to access Guild library' });
            }
            
            res.json({ 
                stories: rows || [],
                totalStories: rows ? rows.length : 0,
                guildLibrary: true
            });
        });
        
    } catch (error) {
        console.error('Get stories error:', error);
        res.status(500).json({ error: 'Failed to access Guild library' });
    }
});

// Enhanced API endpoint for StoryForge AI calls
app.post('/api/editor', async (req, res) => {
    try {
        // Check if API key is configured
        if (!GEMINI_KEY) {
            console.error('StoryForge AI key not configured');
            return res.status(500).json({ 
                error: 'StoryForge AI services not configured. Please contact Guild support.' 
            });
        }

        console.log('StoryForge AI Mentor processing request...');
        
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
            {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'User-Agent': 'StoryForge-Guild/1.0'
                },
                body: JSON.stringify({
                    ...req.body,
                    safetySettings: [
                        {
                            category: "HARM_CATEGORY_HARASSMENT",
                            threshold: "BLOCK_MEDIUM_AND_ABOVE"
                        },
                        {
                            category: "HARM_CATEGORY_HATE_SPEECH", 
                            threshold: "BLOCK_MEDIUM_AND_ABOVE"
                        },
                        {
                            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                            threshold: "BLOCK_MEDIUM_AND_ABOVE"
                        },
                        {
                            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                            threshold: "BLOCK_MEDIUM_AND_ABOVE"
                        }
                    ]
                })
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('StoryForge AI Error:', response.status, errorText);
            return res.status(response.status).json({ 
                error: `StoryForge AI Mentor unavailable: ${response.status}`,
                guildMessage: 'The Writing Mentor is temporarily unavailable. Please try again shortly.'
            });
        }

        const data = await response.json();
        
        res.json(data);
        
    } catch (error) {
        console.error('StoryForge server error:', error);
        res.status(500).json({ 
            error: 'Guild services temporarily unavailable',
            message: error.message
        });
    }
});

// Serve index.html for all other routes (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`🏰 StoryForge Guild Server is now active on port ${port}`);
    console.log(`📖 Tagline: "Forge Your Own Epic. Learn to Write, One Story at a Time."`);
    console.log(`🌐 Guild Portal: http://localhost:${port}`);
    console.log(`🤖 AI Writing Mentor: ${GEMINI_KEY ? 'ACTIVE' : 'OFFLINE'}`);
    console.log(`📚 Story Library: CONNECTED`);
    console.log(`🔐 Guild Security (WebAuthn): ENABLED for ${rpID}`);
    console.log(`📁 Static files served from: ${__dirname}`);
    console.log(`⚒️  Welcome to the StoryForge Guild! Ready to help young writers forge their epics.`);
});
