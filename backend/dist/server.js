"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const env_1 = require("./config/env");
const containerRoutes_1 = __importDefault(require("./modules/containers/routes/containerRoutes"));
const terminalGateway_1 = require("./modules/terminal/gateway/terminalGateway");
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
app.use((0, cors_1.default)({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE']
}));
app.use(express_1.default.json());
// Container API Router
app.use('/api/containers', containerRoutes_1.default);
// Socket.IO Setup
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});
terminalGateway_1.TerminalGateway.handleConnections(io);
server.listen(env_1.ENV.PORT, () => {
    console.log(`Backend server running in ${env_1.ENV.NODE_ENV} mode on port ${env_1.ENV.PORT}`);
});
