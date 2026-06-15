"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContainerService = void 0;
const ContainerManager_1 = require("../../../infrastructure/docker/ContainerManager");
class ContainerService {
    static async listContainers() {
        return ContainerManager_1.ContainerManager.listContainers();
    }
    static async createContainer(name) {
        return ContainerManager_1.ContainerManager.createContainer(name);
    }
    static async startContainer(id) {
        await ContainerManager_1.ContainerManager.startContainer(id);
    }
    static async stopContainer(id) {
        await ContainerManager_1.ContainerManager.stopContainer(id);
    }
    static async deleteContainer(id) {
        await ContainerManager_1.ContainerManager.deleteContainer(id);
    }
}
exports.ContainerService = ContainerService;
