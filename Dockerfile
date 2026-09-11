FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

ENV NODE_ENV=production

# Applies pending migrations, then starts the bot (long polling, no HTTP port).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
