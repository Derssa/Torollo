import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { ENV } from './config/env';
import projectRouter from './modules/projects/routes/projectRoutes';
import containerRouter from './modules/containers/routes/containerRoutes';
import healthRouter from './modules/health/routes/healthRoutes';
import learningRouter from './modules/learning/routes/learningRoutes';
import { TerminalGateway } from './modules/terminal/gateway/terminalGateway';
import { DockerInitializer } from './infrastructure/docker/DockerInitializer';

const app = express();
const server = http.createServer(app);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
}));
app.use(express.json());

// Health probe
app.use('/health', healthRouter);

// Scoped APIs
app.use('/api/projects', projectRouter);
app.use('/api/projects/:projectId/containers', containerRouter);
app.use('/api/learning', learningRouter);

// Socket.IO Setup
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

TerminalGateway.handleConnections(io);

server.listen(ENV.PORT, () => {
  console.log(`Backend server running in ${ENV.NODE_ENV} mode on port ${ENV.PORT}`);
  // Run background Docker check & pull
  DockerInitializer.initialize();
});
