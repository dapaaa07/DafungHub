FROM node:20-alpine

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install runtime production dependencies
RUN npm install --omit=dev

# Copy application source and prebuilt bundle
COPY . .

# Production environment
ENV NODE_ENV=production

# Run bot directly with node
CMD ["node", "dist/bot.js"]
