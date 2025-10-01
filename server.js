import express from 'express';
import cors from 'cors';
import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

// Enable CORS for all routes
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Serve static files
app.use(express.static('.'));

// Serve the knackFunctions.js file with proper headers
app.get('/knackFunctions.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    try {
        const content = fs.readFileSync('./knackFunctions.js', 'utf8');
        res.send(content);
    } catch (error) {
        res.status(500).send(`Error reading file: ${error.message}`);
    }
});

// Basic test endpoint
app.get('/test', (req, res) => {
    res.json({
        message: 'KnackFunctions development server is running!',
        timestamp: new Date().toISOString(),
        file: 'knackFunctions.js available at /knackFunctions.js'
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', port: PORT });
});

// Serve a simple test page
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>KnackFunctions Development Server</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; }
                .container { max-width: 800px; margin: 0 auto; }
                .status { padding: 10px; background: #e8f5e8; border: 1px solid #4caf50; border-radius: 4px; }
                .endpoint { background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 4px; }
                code { background: #f0f0f0; padding: 2px 4px; border-radius: 2px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>KnackFunctions Development Server</h1>
                <div class="status">
                    ✅ Server running on port ${PORT}
                </div>

                <h2>Available Endpoints:</h2>
                <div class="endpoint">
                    <strong>Main File:</strong><br>
                    <code>http://localhost:${PORT}/knackFunctions.js</code><br>
                    <em>Your main knackFunctions.js file with no-cache headers</em>
                </div>

                <div class="endpoint">
                    <strong>Test:</strong><br>
                    <code>http://localhost:${PORT}/test</code><br>
                    <em>JSON test endpoint</em>
                </div>

                <div class="endpoint">
                    <strong>Health Check:</strong><br>
                    <code>http://localhost:${PORT}/health</code><br>
                    <em>Server health status</em>
                </div>

                <h2>Usage in Knack:</h2>
                <p>Include this script tag in your Knack app to load your local development version:</p>
                <div class="endpoint">
                    <code>&lt;script src="http://localhost:${PORT}/knackFunctions.js"&gt;&lt;/script&gt;</code>
                </div>

                <h2>File Watching:</h2>
                <p>The server automatically detects changes to knackFunctions.js. Just refresh your Knack app to see updates!</p>

                <div id="status"></div>

                <script>
                    // Simple status updater
                    setInterval(async () => {
                        try {
                            const response = await fetch('/health');
                            const data = await response.json();
                            document.getElementById('status').innerHTML =
                                '<p style="color: green;">✅ Server healthy - Last check: ' + new Date().toLocaleTimeString() + '</p>';
                        } catch (error) {
                            document.getElementById('status').innerHTML =
                                '<p style="color: red;">❌ Server unreachable</p>';
                        }
                    }, 5000);
                </script>
            </div>
        </body>
        </html>
    `);
});

// Watch for file changes and log them
const watcher = chokidar.watch('./knackFunctions.js', {
    ignored: /node_modules/,
    persistent: true
});

watcher.on('change', (filePath) => {
    console.log(`📝 File changed: ${filePath} at ${new Date().toLocaleTimeString()}`);
    console.log('🔄 Refresh your Knack app to see changes');
});

// Start the server
app.listen(PORT, () => {
    console.log('🚀 KnackFunctions Development Server Started');
    console.log(`📍 Server: http://localhost:${PORT}`);
    console.log(`📄 Main file: http://localhost:${PORT}/knackFunctions.js`);
    console.log(`🧪 Test endpoint: http://localhost:${PORT}/test`);
    console.log('👀 Watching knackFunctions.js for changes...');
    console.log('\n💡 Add this to your Knack app:');
    console.log(`   <script src="http://localhost:${PORT}/knackFunctions.js"></script>`);
    console.log('\n⏹️  Press Ctrl+C to stop the server');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down development server...');
    watcher.close();
    process.exit(0);
});