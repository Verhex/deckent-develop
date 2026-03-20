FROM node:22-slim

# Install tmux and git
RUN apt-get update && apt-get install -y --no-install-recommends \
    tmux \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application
COPY . .

# Build TypeScript
RUN npm run build

# Set workspace directory for deckent operations
WORKDIR /workspace

# Entrypoint
ENTRYPOINT ["node", "/app/dist/cli/index.js"]
