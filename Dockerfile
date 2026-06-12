FROM node:20-alpine AS build
WORKDIR /app
# Prisma engines need OpenSSL, which node:alpine does not ship
RUN apk add --no-cache openssl
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
# Prisma engines need OpenSSL, which node:alpine does not ship
RUN apk add --no-cache openssl
COPY package*.json ./
COPY prisma ./prisma
# Production deps only; prisma CLI lives in dependencies for migrate deploy
RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/tmplt ./tmplt
EXPOSE 3000
# nest build outputs to dist/src/main.js
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]
