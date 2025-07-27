FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

COPY --from=builder /app/src ./src

COPY --from=builder /app/swagger.yaml ./swagger.yaml
COPY --from=builder /app/.env.example ./.env.example

EXPOSE 3000

CMD ["node", "src/app.js"]