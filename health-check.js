// Simple health check server for Railway worker
const http = require('http');
const { exportQueue } = require('./worker-lib/export-queue');

const PORT = process.env.PORT || 3001;

const server = http.createServer(async (req, res) => {
  if (req.url === '/' || req.url === '/health') {
    try {
      // Check Redis connection
      const waiting = await exportQueue.waiting();
      const active = await exportQueue.active();
      const completed = await exportQueue.completed();
      const failed = await exportQueue.failed();
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        queue: {
          waiting,
          active,
          completed,
          failed
        },
        worker: 'running'
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      }));
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`✅ Health check server running on port ${PORT}`);
});

module.exports = server;