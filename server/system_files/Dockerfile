# Use a full debian-based node image to make installing python easier
FROM node:18-bullseye-slim

# Install Python 3 and pip
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Create and change to the app directory.
WORKDIR /usr/src/app

# Copy application dependency manifests to the container image.
COPY package*.json ./

# Install production dependencies.
RUN npm install --only=production

# Copy local code to the container image.
COPY . .

# Expose the port the app runs on.
EXPOSE 3000

# Run the web service on container startup.
CMD [ "npm", "start" ]
