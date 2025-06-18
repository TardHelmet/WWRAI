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
    // Users table (minimal data - just first name and passkey info)
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

// WebAuthn configuration - updated for StoryForge
const rpName = 'StoryForge';
const rpID = process.env.NODE_ENV === 'production' ? 'storyforge.onrender.com' : 'localhost';
const origin = process.env.NODE_ENV === 'production' ? 'https://storyforge.onrender.com' : `http://localhost:${port}`;

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
                        parts: [{ text: "You are a Writing Mentor at StoryForge. Respond with just 'StoryForge Guild Ready!'" }]
                    }]
                })
            }
        );
        
        console.log('Gemini response status:', testResponse.status);
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

// Authentication Routes

// Start passkey registration
app.post('/api/auth/register/begin', async (req, res) => {
    try {
        const { firstName } = req.body;
        
        if (!firstName || firstName.trim().length < 1) {
            return res.status(response.status).json({ 
                error: `StoryForge AI Mentor unavailable: ${response.status}`,
                details: errorText,
                guildMessage: 'The Writing Mentor is temporarily unavailable. Please try again shortly.'
            });
        }

        const data = await response.json();
        console.log('StoryForge AI processing complete');
        console.log('Response generated:', JSON.stringify(data, null, 2));
        
        // Add StoryForge metadata to response
        const enhancedResponse = {
            ...data,
            storyforgeMetadata: {
                service: 'Writing Mentor',
                timestamp: new Date().toISOString(),
                guildActive: true
            }
        };
        
        res.json(enhancedResponse);
        
    } catch (error) {
        console.error('StoryForge server error:', error);
        res.status(500).json({ 
            error: 'Guild services temporarily unavailable',
            message: error.message,
            guildSupport: 'Please try again or contact Guild support if the issue persists.'
        });
    }
});

// Guild statistics endpoint (for future dashboard features)
app.get('/api/guild/stats', (req, res) => {
    try {
        db.all(`SELECT 
            COUNT(*) as totalMembers,
            COUNT(CASE WHEN guild_level = 'Intern' THEN 1 END) as interns,
            COUNT(CASE WHEN guild_level = 'Apprentice' THEN 1 END) as apprentices,
            COUNT(CASE WHEN guild_level = 'Journeyman' THEN 1 END) as journeymen,
            COUNT(CASE WHEN guild_level = 'Master' THEN 1 END) as masters
            FROM users`, [], (err, memberStats) => {
            
            if (err) {
                console.error('Guild stats error:', err);
                return res.status(500).json({ error: 'Unable to access Guild statistics' });
            }
            
            db.all(`SELECT 
                COUNT(*) as totalStories,
                COUNT(CASE WHEN guild_enhanced = 1 THEN 1 END) as guildEnhanced,
                COUNT(CASE WHEN mentor_feedback IS NOT NULL AND mentor_feedback != '' THEN 1 END) as mentorReviewed
                FROM stories`, [], (err, storyStats) => {
                
                if (err) {
                    console.error('Story stats error:', err);
                    return res.status(500).json({ error: 'Unable to access story statistics' });
                }
                
                res.json({
                    guild: {
                        name: 'StoryForge Guild',
                        motto: 'Forge Your Own Epic',
                        status: 'Active'
                    },
                    members: memberStats[0] || {},
                    stories: storyStats[0] || {},
                    services: {
                        writingMentor: !!GEMINI_KEY,
                        guildCollaboration: true,
                        storyLibrary: true
                    }
                });
            });
        });
        
    } catch (error) {
        console.error('Guild stats error:', error);
        res.status(500).json({ error: 'Guild statistics unavailable' });
    }
});

// Enhanced story endpoint with Guild metadata
app.get('/api/stories/:userId/:storyId', (req, res) => {
    try {
        const { userId, storyId } = req.params;
        
        db.get(`SELECT s.*, u.first_name, u.guild_level 
                FROM stories s 
                JOIN users u ON s.user_id = u.id 
                WHERE s.id = ? AND s.user_id = ?`, 
                [storyId, userId], (err, story) => {
            if (err) {
                console.error('Database error getting story:', err);
                return res.status(500).json({ error: 'Failed to retrieve story from Guild library' });
            }
            
            if (!story) {
                return res.status(404).json({ error: 'Story not found in Guild library' });
            }
            
            res.json({
                story: {
                    ...story,
                    guildMetadata: {
                        authorLevel: story.guild_level,
                        mentorReviewed: !!story.mentor_feedback,
                        guildEnhanced: !!story.guild_enhanced,
                        forgedAt: story.created_at
                    }
                }
            });
        });
        
    } catch (error) {
        console.error('Get story error:', error);
        res.status(500).json({ error: 'Failed to access Guild library' });
    }
});

// Delete story endpoint
app.delete('/api/stories/:userId/:storyId', (req, res) => {
    try {
        const { userId, storyId } = req.params;
        
        db.run(`DELETE FROM stories WHERE id = ? AND user_id = ?`, 
               [storyId, userId], function(err) {
            if (err) {
                console.error('Database error deleting story:', err);
                return res.status(500).json({ error: 'Failed to remove story from Guild library' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Story not found in Guild library' });
            }
            
            res.json({ 
                success: true, 
                message: 'Story removed from Guild library',
                deletedStoryId: storyId
            });
        });
        
    } catch (error) {
        console.error('Delete story error:', error);
        res.status(500).json({ error: 'Failed to remove story from Guild library' });
    }
});

// Update user guild level (for future progression system)
app.patch('/api/users/:userId/guild-level', (req, res) => {
    try {
        const { userId } = req.params;
        const { guildLevel } = req.body;
        
        const validLevels = ['Intern', 'Apprentice', 'Journeyman', 'Master'];
        if (!validLevels.includes(guildLevel)) {
            return res.status(400).json({ error: 'Invalid Guild level' });
        }
        
        db.run(`UPDATE users SET guild_level = ? WHERE id = ?`, 
               [guildLevel, userId], function(err) {
            if (err) {
                console.error('Database error updating Guild level:', err);
                return res.status(500).json({ error: 'Failed to update Guild level' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Guild member not found' });
            }
            
            res.json({ 
                success: true, 
                message: `Guild level updated to ${guildLevel}`,
                newLevel: guildLevel
            });
        });
        
    } catch (error) {
        console.error('Update guild level error:', error);
        res.status(500).json({ error: 'Failed to update Guild level' });
    }
});

// Serve index.html for all other routes (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Enhanced startup message
app.listen(port, () => {
    console.log(`🏰 StoryForge Guild Server is now active on port ${port}`);
    console.log(`📖 Tagline: "Forge Your Own Epic. Learn to Write, One Story at a Time."`);
    console.log(`🌐 Guild Portal: http://localhost:${port}`);
    console.log(`🤖 AI Writing Mentor: ${GEMINI_KEY ? 'ACTIVE' : 'OFFLINE'}`);
    console.log(`📚 Story Library: CONNECTED`);
    console.log(`🔐 Guild Security (WebAuthn): ENABLED for ${rpID}`);
    console.log(`📁 Static files served from: ${__dirname}`);
    console.log(`⚒️  Welcome to the StoryForge Guild! Ready to help young writers forge their epics.`);
    
    // Log database status
    db.get("SELECT COUNT(*) as count FROM users", (err, result) => {
        if (!err) {
            console.log(`👥 Current Guild Members: ${result.count}`);
        }
    });
    
    db.get("SELECT COUNT(*) as count FROM stories", (err, result) => {
        if (!err) {
            console.log(`📚 Stories in Guild Library: ${result.count}`);
        }
    });
});400).json({ error: 'Name is required to join the Guild' });
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
        
        // Store challenge temporarily (in production, use Redis or session store)
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

// Story Management Routes

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
        console.log('Request received:', JSON.stringify(req.body, null, 2));
        
        // Add StoryForge-specific headers and configuration
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
            {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'User-Agent': 'StoryForge-Guild/1.0',
                    'X-Service': 'StoryForge-AI-Mentor'
                },
                body: JSON.stringify({
                    ...req.body,
                    // Add safety settings for child-appropriate content
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

        console.log('StoryForge AI response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('StoryForge AI Error:', response.status, errorText);
            return res.status(