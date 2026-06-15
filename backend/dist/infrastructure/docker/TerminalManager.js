"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerminalManager = void 0;
const DockerClient_1 = __importDefault(require("./DockerClient"));
class TerminalManager {
    static async createTerminalSession(containerId) {
        const container = DockerClient_1.default.getContainer(containerId);
        const exec = await container.exec({
            Cmd: ['/bin/bash'],
            AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true,
            Tty: true
        });
        const stream = await new Promise((resolve, reject) => {
            exec.start({ hijack: true, stdin: true }, (err, execStream) => {
                if (err || !execStream)
                    return reject(err || new Error('Failed to start terminal stream'));
                resolve(execStream);
            });
        });
        return { stream, exec };
    }
    static async resizeTerminal(exec, cols, rows) {
        try {
            await exec.resize({ h: rows, w: cols });
        }
        catch (err) {
            // Ignore normal resize errors on stream close
        }
    }
}
exports.TerminalManager = TerminalManager;
