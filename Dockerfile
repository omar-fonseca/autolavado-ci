FROM node:22-alpine

WORKDIR /app

COPY --chown=node:node backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=node:node backend/src ./src
COPY --chown=node:node backend/migrations ./migrations
COPY --chown=node:node backend/tests ./tests
COPY --chown=node:node frontend /frontend

ENV NODE_ENV=development \
    PORT=3000 \
    AUTO_MIGRATE=true

USER node
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
