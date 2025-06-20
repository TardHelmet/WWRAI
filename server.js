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

// --- Gemini AI Endpoint (remains the same) ---
app.post('/api/storyforge-ai', async (req, res) => {
    // This endpoint's logic does not need to change.
    // ... (Your existing Gemini API logic here) ...
});


// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('StoryForge Guild is healthy');
});


// Serve index.html for all other routes (for the SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`🏰 StoryForge Guild Server is now active on port ${port}`);
    console.log(`📖 Tagline: "Forge Your Own Epic. Learn to Write, One Story at aTime."`);
    console.log(`🌐 Guild Portal: http://localhost:${port}`);
});
```

And here is the complete, corrected code for `index.html`. This version fixes the error you were seeing.


```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>StoryForge - Forge Your Own Epic</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #2563eb 0%, #1e40af 50%, #1e3a8a 100%);
            color: #1f2937;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .page {
            display: none;
            width: 100%;
            max-width: 900px;
            margin: 0 auto;
            padding: 20px;
        }
        .card {
            background: white;
            border-radius: 16px;
            padding: 32px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
            margin-bottom: 20px;
        }
        h1 {
            color: #1e40af;
            text-align: center;
            margin-bottom: 8px;
        }
        .subtitle {
            text-align: center;
            color: #4b5563;
            margin-bottom: 24px;
        }
        input[type="text"] {
            width: 100%;
            padding: 12px;
            border-radius: 8px;
            border: 1px solid #d1d5db;
            margin-bottom: 16px;
            font-size: 16px;
        }
        button {
            width: 100%;
            padding: 12px;
            border: none;
            border-radius: 8px;
            background-color: #2563eb;
            color: white;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        button:hover {
            background-color: #1d4ed8;
        }
        .secondary-button {
            background-color: #6b7280;
        }
        .secondary-button:hover {
            background-color: #4b5563;
        }
        .story-item {
            border: 1px solid #e5e7eb;
            padding: 16px;
            border-radius: 8px;
            margin-bottom: 12px;
        }
    </style>
</head>
<body>

    <div id="loadingPage" class="page" style="text-align: center;">
        <p>Loading Your Adventures...</p>
    </div>

    <div id="loginPage" class="page">
        <div class="card">
            <h1>Welcome to StoryForge</h1>
            <p class="subtitle">What should we call you, brave storyteller?</p>
            <input type="text" id="firstNameInput" placeholder="Enter your first name...">
            <button id="registerButton">Begin My Adventure</button>
        </div>
    </div>

    <div id="dashboardPage" class="page">
        <div class="card">
            <h1 id="welcomeMessage">Welcome!</h1>
            <p class="subtitle">This is your story library. Start a new adventure or continue a previous one.</p>
            <button id="newStoryButton" style="margin-bottom: 20px;">+ New Story</button>
            <button id="logoutButton" class="secondary-button">Logout</button>
        </div>
        <div class="card">
            <h2>Your Stories</h2>
            <div id="storyList">
                <!-- Stories will be listed here -->
            </div>
        </div>
    </div>
    
    <div id="workshopPage" class="page">
        <div class="card">
            <h1>Story Workshop</h1>
            <p>The workshop is under construction. Check back soon!</p>
             <button onclick="showPage('dashboardPage')">Back to Dashboard</button>
        </div>
    </div>

    <script>
        let currentUser = null;

        function showPage(pageId) {
            document.querySelectorAll('.page').forEach(page => {
                page.style.display = 'none';
            });
            const targetPage = document.getElementById(pageId);
            if (targetPage) {
                targetPage.style.display = 'block';
            }
        }

        async function initializeApp() {
            const userId = localStorage.getItem('storyforge_user_id');
            showPage('loadingPage');

            if (userId) {
                try {
                    const response = await fetch(`/api/users/${userId}`);
                    if (response.ok) {
                        const data = await response.json();
                        currentUser = data.user;
                        displayStories(data.stories);
                        showPage('dashboardPage');
                        // This now runs AFTER the page is visible
                        document.getElementById('welcomeMessage').textContent = `Welcome back, ${currentUser.first_name}!`;
                    } else {
                        localStorage.removeItem('storyforge_user_id');
                        showPage('loginPage');
                    }
                } catch (error) {
                    console.error('Error fetching user data:', error);
                    showPage('loginPage');
                }
            } else {
                showPage('loginPage');
            }
        }

        async function registerUser() {
            const firstName = document.getElementById('firstNameInput').value.trim();
            if (!firstName) {
                alert('Please enter your first name.');
                return;
            }

            try {
                const response = await fetch('/api/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ firstName }),
                });
                const newUser = await response.json();

                if (response.ok) {
                    currentUser = newUser;
                    localStorage.setItem('storyforge_user_id', newUser.id);
                    displayStories([]);
                    showPage('dashboardPage');
                    // *** THE FIX IS HERE ***
                    // We set the welcome message *after* switching to the dashboard page.
                    document.getElementById('welcomeMessage').textContent = `Welcome, ${currentUser.first_name}!`;
                } else {
                    alert(newUser.error || 'Registration failed.');
                }
            } catch (error) {
                console.error('Registration error:', error);
                alert('An error occurred during registration.');
            }
        }

        function displayStories(stories) {
            const storyList = document.getElementById('storyList');
            storyList.innerHTML = '';
            if (!stories || stories.length === 0) {
                storyList.innerHTML = '<p style="text-align:center; padding: 20px;">Your story library is empty. Click "New Story" to begin!</p>';
                return;
            }

            stories.forEach(story => {
                const storyElement = document.createElement('div');
                storyElement.className = 'story-item';
                storyElement.innerHTML = `<h3>${story.title || 'Untitled Story'}</h3><p>Created: ${new Date(story.created_at).toLocaleDateString()}</p>`;
                storyList.appendChild(storyElement);
            });
        }

        function logout() {
            localStorage.removeItem('storyforge_user_id');
            currentUser = null;
            window.location.reload();
        }

        document.addEventListener('DOMContentLoaded', () => {
            document.getElementById('registerButton').addEventListener('click', registerUser);
            document.getElementById('newStoryButton').addEventListener('click', () => showPage('workshopPage'));
            document.getElementById('logoutButton').addEventListener('click', logout);
            document.getElementById('firstNameInput').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') registerUser();
            });
            initializeApp();
        });
    </script>
</body>
</html>
```

Please replace the content of your files with this new code. This should resolve the issues and get your application running smooth
