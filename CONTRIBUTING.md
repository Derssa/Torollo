# Contributing to Torollo

First off, thank you for considering contributing to Torollo! It's people like you that make Torollo an amazing tool for making system design and networking concepts accessible, interactive, and free for everyone.

This document provides guidelines and steps for contributing to this project.

## How Can I Contribute?

*   **Reporting Bugs:** If you find a bug, please open an issue and describe the steps to reproduce it, what you expected to happen, and what actually happened.
*   **Suggesting Enhancements:** Have an idea for a new feature? Open an issue to discuss it before you start coding!
*   **Code Contributions:** We welcome pull requests! Whether it's fixing a typo, resolving a bug, or building a new feature.
*   **Adding a New Node:** Want to add a new piece of infrastructure to the canvas (a database, cache, broker, …)? Follow our step-by-step [Adding a New Node](docs/adding-a-node.md) guide, which also documents our code standards.
*   **Documentation:** Improving our documentation is just as important as writing code.

## Local Development Setup

To run the project locally, you will need Node.js (v18+) and Docker Desktop installed and running.

### 1. Clone the repository
```bash
git clone https://github.com/Derssa/torollo.git
cd torollo
```

### 2. Install dependencies
You need to install dependencies in the root directory, as well as in the frontend and backend folders.
```bash
npm install
cd backend && npm install
cd ../frontend && npm install
```

### 3. Running the Lab in Development Mode
You will need two separate terminal windows to run both the backend and frontend development servers.

**Terminal 1 (Backend):**
```bash
cd backend
npm run dev
```
*(The backend runs on port 23233 by default)*

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
```
*(The frontend runs on port 23232 by default)*

You can now access the interface at `http://localhost:23232`.

### 4. Testing the Production Build (CLI Mode)
If you want to test how the application runs when bundled via the CLI tool:
```bash
# Build both backend and frontend
npm run build --prefix backend
npm run build --prefix frontend

# Start the app using the CLI
node ./bin/cli.js start
```

## Pull Request Process

1.  **Fork the repo** and create your branch from `main`.
2.  If you've added code that should be tested, please add some test coverage.
3.  Ensure the test suite passes (if applicable).
4.  Make sure your code lints and builds successfully (`npm run build` in both frontend and backend).
5.  Use [Conventional Commits](https://www.conventionalcommits.org/) for your commit messages (e.g., `feat: add new network module`, `fix: resolve docker IP issue`).
6.  Open a Pull Request! Please describe the changes you made and link to any relevant issues.

## Contributor License Agreement (CLA)

By submitting a pull request, you agree to the terms of our [CLA](CLA.md). No signature is required — opening a pull request constitutes acceptance. The CLA protects both you and the project, and does not change your rights to use your own contributions for any other purpose.

## Code of Conduct

By participating in this project, you are expected to uphold our [Code of Conduct](CODE_OF_CONDUCT.md). Please report unacceptable behavior to the project maintainers.
