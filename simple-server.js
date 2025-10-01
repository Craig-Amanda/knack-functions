import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';

const PORT = 3001;

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (pathname === '/knackFunctions.js') {
        try {
            const content = fs.readFileSync('./knackFunctions.js', 'utf8');
            res.writeHead(200, {
                'Content-Type': 'application/javascript',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            res.end(content);
        } catch (error) {
            res.writeHead(500);
            res.end(`Error reading file: ${error.message}`);
        }
    } else if (pathname === '/test') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            message: 'KnackFunctions development server is running!',
            timestamp: new Date().toISOString(),
            file: 'knackFunctions.js available at /knackFunctions.js'
        }));
    } else if (pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>KnackFunctions Development Server (Simple)</title>
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
                    <h1>KnackFunctions Development Server (Simple)</h1>
                    <div class="status">✅ Server running on port ${PORT}</div>

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

                    <h2>Usage in Knack:</h2>
                    <p>In your Knack app, use:</p>
                    <div class="endpoint">
                        <code>&lt;script src="http://localhost:${PORT}/knackFunctions.js"&gt;&lt;/script&gt;</code>
                    </div>

                    <h2>File Watching:</h2>
                    <p>This simple server includes basic file watching. Changes will be logged to the console.</p>
                </div>
            </body>
            </html>
        `);
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`🚀 Simple KnackFunctions Server Started`);
    console.log(`📍 Server: http://localhost:${PORT}`);
    console.log(`📄 Main file: http://localhost:${PORT}/knackFunctions.js`);
    console.log('\n💡 Add this to your Knack app:');
    console.log(`   <script src="http://localhost:${PORT}/knackFunctions.js"></script>`);
    console.log('\n⏹️  Press Ctrl+C to stop the server');
});

// Watch for file changes (simple version)
if (fs.watch) {
    fs.watch('./knackFunctions.js', (eventType, filename) => {
        console.log(`📝 File changed: ${filename} at ${new Date().toLocaleTimeString()}`);
        console.log('🔄 Refresh your Knack app to see changes');
    });
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down simple server...');
    process.exit(0);
});