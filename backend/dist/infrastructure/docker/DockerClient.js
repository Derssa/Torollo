"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dockerode_1 = __importDefault(require("dockerode"));
const env_1 = require("../../config/env");
const docker = new dockerode_1.default({ socketPath: env_1.ENV.DOCKER_SOCKET });
exports.default = docker;
