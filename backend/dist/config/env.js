"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENV = void 0;
exports.ENV = {
    PORT: process.env.PORT || 5000,
    NODE_ENV: process.env.NODE_ENV || 'development',
    DOCKER_SOCKET: process.platform === 'win32'
        ? '//./pipe/docker_engine'
        : '/var/run/docker.sock'
};
