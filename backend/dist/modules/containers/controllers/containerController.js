"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContainerController = void 0;
const containerService_1 = require("../services/containerService");
class ContainerController {
    static async list(req, res) {
        try {
            const list = await containerService_1.ContainerService.listContainers();
            res.json(list);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
    static async create(req, res) {
        try {
            const { name } = req.body;
            if (!name) {
                res.status(400).json({ error: 'Name is required' });
                return;
            }
            const container = await containerService_1.ContainerService.createContainer(name);
            res.status(201).json(container);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
    static async start(req, res) {
        try {
            await containerService_1.ContainerService.startContainer(req.params.id);
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
    static async stop(req, res) {
        try {
            await containerService_1.ContainerService.stopContainer(req.params.id);
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
    static async delete(req, res) {
        try {
            await containerService_1.ContainerService.deleteContainer(req.params.id);
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
}
exports.ContainerController = ContainerController;
