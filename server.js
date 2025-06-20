const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// Get API key from environment variable
const GEMINI_KEY = process.env.GEMINI_API_KEY;

// Initialize SQLite database
const db = new sqlite3.Database('./storyforge.db', (err) => {
    if (err) {
        console.error("Error opening database", err.message);
    } else {
        console.log("Database connected successfully.");
    }
});

// Create tables if they don't exist
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

// --- Simplified User Endpoints ---

// Create a new user
app.post('/api/users', (req, res) => {
    const { firstName } = req.body;
    if (!firstName) {
        return res.status(400).json({ error: 'First name is required.' });
    }

    const newUser = {
        id: `user_${uuidv4()}`,
        firstName: firstName,
        guildLevel: 'Intern',
    };

    const stmt = db.prepare('INSERT INTO users (id, first_name, guild_level) VALUES (?, ?, ?)');
    stmt.run(newUser.id, newUser.firstName, newUser.guildLevel, function(err) {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Could not create new user.' });
        }
        res.status(201).json(newUser);
    });
    stmt.finalize();
});

// Get a user and all their stories by their user ID
app.get('/api/users/:userId', (req, res) => {
    const { userId } = req.params;
    
    db.get('SELECT id, first_name, guild_level FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error while fetching user.' });
        }
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        db.all('SELECT * FROM stories WHERE user_id = ? ORDER BY created_at DESC', [userId], (err, stories) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Could not retrieve stories.' });
            }
            res.json({ user, stories });
        });
    });
});

// --- Gemini AI Endpoint ---
app.post('/api/storyforge-ai', async (req, res) => {
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
                    'User-Agent': 'StoryForge/1.0'
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

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        message: 'StoryForge Guild is healthy',
        timestamp: new Date().toISOString(),
        apiKeyConfigured: !!GEMINI_KEY
    });
});

// Serve index.html for all other routes (for the SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`🏰 StoryForge Guild Server is now active on port ${port}`);
    console.log(`📖 Tagline: "Forge Your Own Epic. Learn to Write, One Story at a Time."`);
    console.log(`🌐 Guild Portal: http://localhost:${port}`);
    console.log(`🔑 API Key configured: ${GEMINI_KEY ? 'YES' : 'NO'}`);
});
