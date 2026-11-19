FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY server.mjs account-pool.mjs LICENSE THIRD_PARTY_NOTICES.md ./
ENV WORKBUDDY_DATA_DIR=/data WORKDADDY_ACCOUNTS_DIR=/accounts WORKBUDDY_LISTEN_HOST=0.0.0.0 WORKBUDDY_AUTH_FILE=/accounts/current.info
EXPOSE 3081
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node --input-type=module -e "import{readFileSync}from'node:fs';const k=readFileSync('/data/api-key','utf8').trim();const r=await fetch('http://127.0.0.1:3081/healthz',{headers:{Authorization:'Bearer '+k}});if(!r.ok)process.exit(1)"
CMD ["node","server.mjs"]
