"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerminalGateway = void 0;
const TerminalManager_1 = require("../../../infrastructure/docker/TerminalManager");
class TerminalGateway {
    static handleConnections(io) {
        io.on('connection', (socket) => {
            let execStream = null;
            socket.on('join-terminal', async ({ containerId }) => {
                try {
                    const session = await TerminalManager_1.TerminalManager.createTerminalSession(containerId);
                    execStream = session.stream;
                    // Stream docker output to Socket.IO client
                    execStream.on('data', (chunk) => {
                        socket.emit('terminal-output', chunk.toString('utf-8'));
                    });
                    execStream.on('end', () => {
                        socket.emit('terminal-output', '\r\nSession closed.\r\n');
                    });
                    socket.on('terminal-input', (data) => {
                        if (execStream) {
                            execStream.write(data);
                        }
                    });
                    socket.on('terminal-resize', async ({ cols, rows }) => {
                        await TerminalManager_1.TerminalManager.resizeTerminal(session.exec, cols, rows);
                    });
                }
                catch (err) {
                    console.error('Terminal session error:', err);
                    socket.emit('terminal-output', `\r\nError starting terminal: ${err.message}\r\n`);
                }
            });
            socket.on('disconnect', () => {
                if (execStream) {
                    try {
                        execStream.end();
                    }
                    catch (err) {
                        // Ignore stream termination errors
                    }
                }
            });
        });
    }
}
exports.TerminalGateway = TerminalGateway;
