FROM node:22-bookworm-slim
WORKDIR /app/remote
COPY remote/package.json remote/package-lock.json ./
RUN npm ci --ignore-scripts
COPY js/ /app/js/
COPY remote/ /app/remote/
RUN npm run build && npm prune --omit=dev --ignore-scripts
USER node
ENV NODE_ENV=production TZ=Australia/Sydney PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]
