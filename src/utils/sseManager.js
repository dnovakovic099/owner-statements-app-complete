const logger = require('./logger');

class SSEManager {
    constructor() {
        this.clients = new Map(); // clientId -> res
    }

    /**
     * Add a new SSE client connection.
     */
    addClient(clientId, res) {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no', // Disable nginx buffering
        });

        // Send initial connected event
        res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);

        this.clients.set(clientId, res);
        logger.info('SSE client connected', { clientId, total: this.clients.size });

        // Remove client on disconnect
        res.on('close', () => {
            this.clients.delete(clientId);
            logger.info('SSE client disconnected', { clientId, total: this.clients.size });
        });
    }

    /**
     * Broadcast an event to all connected clients.
     */
    broadcast(event, data) {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        for (const [clientId, res] of this.clients) {
            try {
                res.write(payload);
            } catch (err) {
                this.clients.delete(clientId);
            }
        }
    }

    /**
     * Send an event to a specific client.
     */
    sendToClient(clientId, event, data) {
        const client = this.clients.get(clientId);
        if (client) {
            try {
                client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
            } catch {
                this.clients.delete(clientId);
            }
        }
    }

    /**
     * Get connected client count.
     */
    getClientCount() {
        return this.clients.size;
    }
}

module.exports = new SSEManager();
