FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p uploads data

# Generate Prisma client
RUN npx prisma generate

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "run", "dev"]