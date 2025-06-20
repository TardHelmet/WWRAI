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
    
    // Stories table
    db.run(`CREATE TABLE IF NOT EXISTS stories (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        title TEXT,
        original_story TEXT,
        ai_edited_story TEXT,
        final_story TEXT,
        video_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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

// Create a new user
app.post('/api/users', (req, res) => {
    const { firstName } = req.body;
    if (!firstName) {
        return res.status(400).json({ error: 'First name is required.' });
    }

    const newUser = {
        id: `user_${uuidv4()}`, // Create a unique ID
        firstName: firstName,
        guildLevel: 'Intern',
    };

    const stmt = db.prepare('INSERT INTO users (id, first_name, guild_level) VALUES (?, ?, ?)');
    stmt.run(newUser.id, newUser.firstName, newUser.guildLevel, (err) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Could not create new user.' });
        }
        // Return the newly created user object, including the ID
        res.status(201).json(newUser);
    });
    stmt.finalize();
});

// Get a user and all their stories by their user ID
app.get('/api/users/:userId', (req, res) => {
    const { userId } = req.params;
    
    // First, find the user
    db.get('SELECT id, first_name, guild_level, created_at FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error while fetching user.' });
        }
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Next, find all stories for that user
        db.all('SELECT * FROM stories WHERE user_id = ? ORDER BY created_at DESC', [userId], (err, stories) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Could not retrieve stories.' });
            }
            // Return the user and their stories together
            res.json({ user, stories });
        });
    });
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
