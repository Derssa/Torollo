"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContainerManager = void 0;
const DockerClient_1 = __importDefault(require("./DockerClient"));
class ContainerManager {
    static LAB_PREFIX = 'akal-lab-';
    static async ensureUbuntuImage() {
        const images = await DockerClient_1.default.listImages();
        const hasUbuntu = images.some(img => img.RepoTags && img.RepoTags.some(tag => tag.startsWith('ubuntu')));
        if (!hasUbuntu) {
            console.log('Ubuntu image not found locally. Pulling ubuntu:latest...');
            await new Promise((resolve, reject) => {
                DockerClient_1.default.pull('ubuntu:latest', {}, (err, stream) => {
                    if (err)
                        return reject(err);
                    if (!stream)
                        return reject(new Error('Pull stream is undefined'));
                    DockerClient_1.default.modem.followProgress(stream, (errFinished) => {
                        if (errFinished)
                            return reject(errFinished);
                        resolve();
                    });
                });
            });
            console.log('Ubuntu image successfully pulled.');
        }
    }
    static async listContainers() {
        const containers = await DockerClient_1.default.listContainers({ all: true });
        return containers
            .filter(c => c.Names.some(name => name.includes(this.LAB_PREFIX)))
            .map(c => ({
            id: c.Id,
            name: c.Names[0].replace(/^\//, '').replace(this.LAB_PREFIX, ''),
            image: c.Image,
            state: c.State,
            status: c.Status
        }));
    }
    static async createContainer(nodeName) {
        await this.ensureUbuntuImage();
        const safeName = `${this.LAB_PREFIX}${nodeName.replace(/[^a-zA-Z0-9-_]/g, '')}`;
        const container = await DockerClient_1.default.createContainer({
            Image: 'ubuntu:latest',
            name: safeName,
            Cmd: ['/bin/bash'],
            Tty: true,
            OpenStdin: true,
            StdinOnce: false,
            HostConfig: {
                AutoRemove: false
            }
        });
        await container.start();
        return {
            id: container.id,
            name: nodeName,
            image: 'ubuntu:latest',
            state: 'running',
            status: 'Up less than a second'
        };
    }
    static async startContainer(id) {
        const container = DockerClient_1.default.getContainer(id);
        await container.start();
    }
    static async stopContainer(id) {
        const container = DockerClient_1.default.getContainer(id);
        await container.stop();
    }
    static async deleteContainer(id) {
        const container = DockerClient_1.default.getContainer(id);
        await container.remove({ force: true });
    }
}
exports.ContainerManager = ContainerManager;
