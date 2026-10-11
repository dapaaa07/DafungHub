FROM node:20-slim

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Set environment
ENV NODE_ENV=production

# Run the Telegram bot
CMD ["npm", "start"]
