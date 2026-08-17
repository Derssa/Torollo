![cover-torollo](https://unpkg.com/torollo/assets/cover-torollo.png)

# Torollo — Backend Systems Lab

[![torollo version](https://img.shields.io/npm/v/torollo.svg?label=version&style=flat-square)](https://www.npmjs.com/package/torollo)
[![license](https://img.shields.io/npm/l/torollo.svg?style=flat-square)](https://github.com/Derssa/torollo/blob/main/LICENSE)
[![node-current](https://img.shields.io/badge/node-%3E%3D18.0.0-success?style=flat-square&logo=nodedotjs)](https://nodejs.org)
[![Downloads](https://img.shields.io/npm/dt/torollo?label=downloads&style=flat-square&color=ff8c00)](https://www.npmjs.com/package/torollo)
[![Stars](https://img.shields.io/github/stars/Derssa/Torollo?label=stars&style=flat-square&color=8b5cf6)](https://github.com/Derssa/Torollo)

> **The Packet Tracer of backend engineering.** Build architectures on a canvas where every node is a real Docker container on your machine — then follow guided roadmaps that grade each step against the actual state of your system.

Drawing boxes is easy; plenty of tools do it. Torollo is different in one specific way: when you draw a link, a real firewall rule is written; when you add a database, a real database starts; and when a roadmap step says *"traffic from the public subnet must not reach Postgres"*, Torollo checks it by probing your **live containers** — not by comparing your answer to a diagram. You can't bluff it, and that's the point.

<!-- demo GIF placeholder: roadmap validation loop (fail → fix → pass), keep above the screenshot -->
<img width="1917" height="907" alt="torollo-example" src="https://github.com/user-attachments/assets/c80a04f1-8cc6-46fb-bf89-23a9af1a1a2d" />

---

## Quick Start

Docker must be running. Then, without cloning or installing anything permanently:

```bash
npx torollo start
```

Open the app, create a project, and hit **Learning** in the topbar — the best first contact with Torollo is a guided roadmap, not an empty canvas. Start with **Deploy a resilient three-tier app**: it walks you from a single web server to a load-balanced, firewalled, database-backed architecture in ten validated steps.

### Run with Docker Compose

The Compose setup builds the frontend and backend, serves them through one local URL, mounts the host Docker socket so Torollo can create lab resources, and persists projects and learning progress in a named volume.

Prerequisites:

- Docker Engine or Docker Desktop with the Docker daemon running.
- Docker Compose v2 (`docker compose version`).

Start the production stack:

```bash
cp .env.example .env # optional: defaults work for localhost
docker compose up --build -d
docker compose logs -f
```

Open `http://localhost:23232`. The first boot can take several minutes while Torollo prepares its node images; follow the backend logs to see progress. Stop the application without deleting its state with:

```bash
docker compose down
```

For development with Vite and nodemon hot reload:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

The development override also publishes the backend at `http://localhost:23233`. Source and roadmap changes are bind-mounted; rebuild after changing dependencies.

Compose reads these optional settings from the root `.env` file:

| Variable | Default | Purpose |
|---|---|---|
| `COMPOSE_PROJECT_NAME` | `torollo` | Prefix for containers, networks, and volumes |
| `TOROLLO_BIND_ADDRESS` | `127.0.0.1` | Host address used for published ports |
| `TOROLLO_FRONTEND_PORT` | `23232` | Browser-facing frontend/proxy port |
| `TOROLLO_BACKEND_PORT` | `23233` | Backend port published only by the development override |
| `TOROLLO_DOCKER_SOCKET` | `/var/run/docker.sock` | Host Docker socket to mount into the backend |
| `TOROLLO_ALLOWED_ORIGINS` | empty | Comma-separated extra browser origins |

Project and roadmap-progress data live in the `torollo-data` named volume. `docker compose down` preserves it; `docker compose down -v` permanently deletes it.

> ⚠️ **Docker access:** The socket mount gives the backend control of the host Docker daemon, which is Torollo's core function. Torollo has no authentication, so anyone who can reach the published port inherits that control — the default `TOROLLO_BIND_ADDRESS=127.0.0.1` is what keeps the stack private, not `TOROLLO_ALLOWED_ORIGINS`, which only covers browsers. Read [Self-Hosting & Network Exposure](#self-hosting--network-exposure) before changing it, and do not run untrusted Torollo images. Rootless Docker users can set `TOROLLO_DOCKER_SOCKET=/run/user/<uid>/docker.sock`.

---

## Guided, auto-graded roadmaps

The learning engine is what Torollo is really about. A roadmap is a sequence of steps — instructions, progressive hints, a solution if you're stuck — and every step is closed by **validators that assert against the real state of your lab**:

* container status and ASG replica counts,
* SQL schemas and data, MongoDB collections, Redis keys,
* network reachability and firewall restrictions between subnets,
* HTTP availability and response content.

A green check means your architecture actually does what the step asked. A red one tells you what was expected and what was observed instead — reading that gap is where the learning happens.

Current catalogue (English and French):

| Roadmap | Difficulty | ~Time | You practice |
|---|---|---|---|
| Deploy a resilient three-tier app | intermediate | 40 min | Load balancing, security groups, private subnets, autoscaling |
| Cache-aside with Redis | intermediate | 30 min | Caching strategy, TTLs, invalidation, measuring hit rates |
| Workers & the Redis job queue | intermediate | 40 min | Async decoupling, queues, scaling workers under load, poison messages |

**Roadmaps are plain JSON — no code.** The format is open and documented in the [Roadmap Authoring Reference](docs/roadmap-format.md); drop a valid file into `roadmaps/` — or import any roadmap file or `.zip` pack from the Learning page, no repo checkout needed ([how it works](docs/local-roadmaps.md)) — and it appears in the catalogue. Community-authored roadmaps are very welcome. The validation HTTP API is documented in [learning-api.md](docs/learning-api.md).

---

## What you can put on the canvas

Every node maps 1:1 to a real Docker container running locally.

* **Compute**
    * **Ubuntu Server** — a Linux container with a native web terminal in your browser (WebSockets + xterm.js).
    * **Auto Scaling Group** — define a template, scale replicas up and down instantly.
* **Data**
    * **PostgreSQL** — with a built-in explorer for schemas, tables, and live SQL.
    * **MongoDB** — with an explorer for collections and JSON queries.
    * **Redis** — with an explorer for keys and native CLI commands.
* **Messaging**
    * **RabbitMQ** — message broker with management UI access.
* **Networking & security**
    * **VPC & Subnets** — isolated network boundaries backed by real Docker bridge networks.
    * **Security Groups** — visual inbound/outbound rules, enforced as actual `iptables` rules inside the containers.
    * **Load Balancer (Nginx)** — upstream configuration generated from the nodes you wire to it.
    * **NAT Gateway** — outbound access for private subnets via real `ip_forward` and `MASQUERADE` routing.

Beyond the nodes themselves: a traffic simulator to watch requests flow through your topology, root web terminals into any container, and clickable `localhost` shortcuts that appear when your firewall rules actually allow the traffic.

---

## Self-Hosting & Network Exposure

By default, the Torollo API binds to `127.0.0.1` and only accepts cross-origin requests from local origins (`localhost`, `127.0.0.1`, `[::1]`). Other machines on your network cannot reach it, and no configuration is needed for normal use.

To access Torollo from another machine (e.g. a home lab server), opt in explicitly:

```bash
TOROLLO_HOST=0.0.0.0 TOROLLO_ALLOWED_ORIGINS=http://<your-lan-ip>:23232 npx torollo start
```

For Compose, set the equivalent root `.env` values and restart the stack:

```dotenv
TOROLLO_BIND_ADDRESS=0.0.0.0
TOROLLO_ALLOWED_ORIGINS=http://<your-lan-ip>:23232
```

- `TOROLLO_HOST` — address the API binds to (default `127.0.0.1`; set to `0.0.0.0` to listen on all interfaces).
- `TOROLLO_ALLOWED_ORIGINS` — comma-separated list of exact extra origins allowed to call the API from a browser (the address you type into the browser, e.g. `http://192.168.1.5:23232`).

> ⚠️ **Warning:** Torollo has no authentication. Exposing it gives everyone on the network terminal access to its containers and control over Docker on your machine. Only do this on a trusted network, or put it behind an authenticating reverse proxy.

---

## Architecture

* **Backend** — Node.js, Express, TypeScript, Socket.IO, Dockerode. The backend is the supervisor: it drives the local Docker daemon, compiles your visual topology into real `iptables` rules applied inside the containers, and persists state in `~/.torollo/projects.json`. Every node image must ship with `iptables` and `iproute2` — see [Required tooling inside every node image](docs/adding-a-node.md#required-tooling-inside-every-node-image).
* **Frontend** — React, TypeScript, Vite, React Flow. Renders the canvas, node inspectors, database explorers, the roadmap player, and `xterm.js` terminals.

---

## Contributing

* **Write a roadmap** — the highest-leverage contribution, and it's JSON only. Start from the [format reference](docs/roadmap-format.md).
* **Add a node type** — follow the step-by-step [adding-a-node guide](docs/adding-a-node.md).
* **Everything else** — see [CONTRIBUTING.md](CONTRIBUTING.md). Ideas for new directions (observability nodes, exporting a topology to IaC, …) are best opened as an issue first.

---

## Philosophy

Everything runs **locally**, and the core is **MIT-licensed** — that's permanent, not a launch promise.

- No cloud credentials, no remote infrastructure created or billed.
- Every node on the canvas corresponds exactly to a live Docker container on your machine.
- Torollo is educational by design: not an AWS clone, not a production orchestration tool — a lab where system design becomes tangible because it actually executes.
