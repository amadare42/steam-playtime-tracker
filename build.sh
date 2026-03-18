#!/bin/bash

# Build script for Steam Playtime Tracker
# This builds the client into the server's public directory using Docker

set -e

echo "Building Steam Playtime Tracker with client integration..."

# Build the Docker image
docker build -f server/Dockerfile -t steam-playtime-tracker .

echo "✅ Build completed! The client has been built and integrated into the server."
echo "To run the container:"
echo "  docker run -p 3000:3000 steam-playtime-tracker"
echo ""
echo "Or use docker-compose if you have a compose file configured."