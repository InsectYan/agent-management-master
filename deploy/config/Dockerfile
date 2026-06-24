FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY app ./app
COPY config ./config
COPY plugins ./plugins
COPY app.js ./

RUN adduser -D appuser \
  && mkdir -p /app/data /app/workspaces /app/memory_files /app/logs /app/run \
  && chown -R appuser:appuser /app

USER appuser

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=30s \
  CMD curl -f http://127.0.0.1:3001/health || exit 1

CMD ["npx", "egg-scripts", "start", "--title=agent-management", "--workers=1"]
