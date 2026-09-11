FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# Applies pending migrations, then starts the bot (long polling, no HTTP port).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
