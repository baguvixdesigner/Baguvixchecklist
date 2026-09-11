FROM node:22-alpine
WORKDIR /app

# Prisma's query/schema engines need a real OpenSSL on Alpine, otherwise they
# crash on startup with an unparseable error instead of JSON.
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

ENV NODE_ENV=production

# Applies pending migrations, then starts the bot (long polling, no HTTP port).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
