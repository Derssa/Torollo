![cover-torollo](https://unpkg.com/torollo/assets/cover-torollo.png)

# TOROLLO — Backend Systems Lab

[![torollo version](https://img.shields.io/npm/v/torollo.svg?label=version&style=flat-square)](https://www.npmjs.com/package/torollo)
[![license](https://img.shields.io/npm/l/torollo.svg?style=flat-square)](https://github.com/Derssa/torollo/blob/main/LICENSE)
[![node-current](https://img.shields.io/badge/node-%3E%3D18.0.0-success?style=flat-square&logo=nodedotjs)](https://nodejs.org)
[![Downloads](https://img.shields.io/npm/dt/torollo?label=downloads&style=flat-square&color=ff8c00)](https://www.npmjs.com/package/torollo)
[![Stars](https://img.shields.io/github/stars/Derssa/Torollo?label=stars&style=flat-square&color=8b5cf6)](https://github.com/Derssa/Torollo)

> **A local-first visual simulator and educational playground for backend engineering and system design, inspired by Packet Tracer.**

TOROLLO is an interactive, visual sandbox designed to help students and developers learn backend architecture, Docker, networking, databases, and system design by actually building and running systems on their local machines.

<img width="1917" height="907" alt="torollo-example" src="https://github.com/user-attachments/assets/c80a04f1-8cc6-46fb-bf89-23a9af1a1a2d" />

## Technology Stack
*   **Frontend:** React, TypeScript, Vite, React Flow, xterm.js
*   **Backend:** Node.js, Express, TypeScript, Socket.io
*   **Orchestration:** Docker, Dockerode (Interacts directly with your local Docker Daemon)

---

## Quick Start

Run the lab instantly from your terminal without needing to clone the repo or install anything permanently:

```bash
npx torollo start
```
*(Note: Ensure Docker Desktop is running before starting, as Torollo orchestrates real local containers)*

---

## Supported Infrastructure Nodes

You can drag and drop a wide range of infrastructure components onto the canvas. Everything is backed by **real Docker containers** running locally on your machine.

*   **Computing**
    *   **Ubuntu Server:** A basic Linux container. Includes a fully functional, native web-terminal integrated directly into your browser via WebSockets.
    *   **Auto Scaling Group (ASG):** Define a template and scale replicas up or down instantly.
*   **Databases / Caches**
    *   **PostgreSQL:** Relational database node. Features a built-in interactive Explorer to view schemas, tables, and execute SQL queries directly from the UI.
    *   **MongoDB (NoSQL):** Document database node. Features an interactive Explorer to view collections and run JSON queries without needing external GUI clients.
    *   **Redis (Cache Store):** In-memory data store. Includes a built-in Explorer to view keys and run native Redis CLI commands interactively.
*   **Networking & Security**
    *   **VPC & Subnets:** Isolated network boundaries backed by custom Docker bridge networks.
    *   **Security Groups:** Drag-and-drop visual firewall rules (Inbound/Outbound). Rules are converted and enforced using actual `iptables` injected securely into the containers.
    *   **Load Balancer (Nginx):** Automatically generates upstream `nginx.conf` configurations based on the nodes you wire to it.
    *   **NAT Gateway:** Provides outbound internet access for private subnets using true Linux `ip_forward=1` and `MASQUERADE` routing.

---

## 🎓 Interactive Roadmaps & Learning Paths

Torollo includes a powerful, local-first **declarative learning and validation engine** that guides you through building complex architectures step-by-step.

*   **Interactive Playlists:** Follow step-by-step blueprints on the sidebar player, complete with instructions, progressive hints, and copy-pasteable terminal blocks.
*   **Automatic Live Validation:** Every step runs auto-checkers against your actual Docker environment:
    *   *Container status* & *replication scale* (ASG checks).
    *   *Database schema* & *data existence* (SQL & MongoDB collection checks).
    *   *Network connectivity* & *firewall restrictions* (Inbound firewall checks).
    *   *Web server availability* & *HTTP content* (Curl checks).
*   **Dynamic UI Integrations:** Clickable `http://localhost:<mapped_port>` shortcuts are dynamically generated in the player sidebar when public subnet and port-80 firewall requirements are fulfilled.
*   **JSON-only Contributions:** Create and customize learning paths with zero frontend or backend code! Simply author a JSON configuration file and drop it in the `roadmaps/` directory. See the [Roadmap Authoring Reference](docs/roadmap-format.md) for details.

---

## Coming Very Soon

*   **Terraform Generation:** Automatic Infrastructure-as-Code (IaC) generation for your visual architectures, supporting every major cloud provider (AWS, Azure, GCP).
*   **Message Brokers:** RabbitMQ, Kafka
*   **Application Services:** API Service, Microservices Host, Serverless Functions
*   **Observability:** Live Metrics, Logs, & Monitoring Components

---

## Core Features & Architecture

### Interactive Learning by Doing
Instead of reading passive, theory-heavy documentation, you learn by *doing*:
- **Create Systems:** Drag and drop real components to build architectures.
- **Run & Connect:** Wire services together and see how they interact.
- **Simulate Traffic:** Use the built-in Network Simulator to send pings and watch mock traffic flow through the system.
- **Web Terminals:** Instantly open a root shell into any Ubuntu or Database container straight from the browser.

### Architecture Overview
*   **Backend:** Node.js, Express, TypeScript, and Dockerode. The backend acts as the supervisor—it manipulates the local Docker daemon, compiles your visual network topology into real `iptables` rules, and manages persistent state in `~/.torollo/projects.json`. Because those rules are applied *inside* the containers, every node image must ship with `iptables` and `iproute2` installed — see [Required tooling inside every node image](docs/adding-a-node.md#required-tooling-inside-every-node-image).
*   **Frontend:** React, TypeScript, Vite, and React Flow. Renders the interactive visual grid, node inspector modals, database explorers, and `xterm.js` terminals.

---

## Core Philosophy

Everything runs **locally** on your machine. 
- **No Cloud integrations** (No AWS credentials needed).
- **No remote infrastructure** is created, billed, or managed. 
- All nodes in the workspace correspond exactly to live Docker containers on your local system.

*Note: This project is strictly educational. It is not an AWS clone or a production infrastructure management tool—it is a sandboxed simulator designed to make system design tangible, visual, and fun.*
