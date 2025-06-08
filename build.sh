#!/bin/bash
set -e

# Install system dependencies
apt-get update
apt-get install -y curl

# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Install Python dependencies
python -m pip install --upgrade pip
pip install -r requirements.txt 