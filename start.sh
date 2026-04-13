#!/bin/bash
# Render startup script
# Installs Ollama and pulls a small model for sentiment analysis

# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Start Ollama in background
ollama serve &

# Wait for Ollama to be ready
sleep 5

# Pull a small model
ollama pull qwen2.5:1.5b

# Start the app
node server.js