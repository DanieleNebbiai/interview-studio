# Use Node.js LTS with Alpine for smaller image
FROM node:20-alpine

# Install FFmpeg and other required system dependencies
RUN apk add --no-cache \
    ffmpeg \
    curl \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (include dev dependencies for tsx)
RUN npm ci

# Copy source code
COPY . .

# Create temp directory for video processing
RUN mkdir -p /tmp && chmod 777 /tmp

# Expose port (not needed for worker but good practice)
EXPOSE 3000

# Default command (will be overridden by Railway)  
CMD ["./node_modules/.bin/tsx", "worker-supabase.ts"]