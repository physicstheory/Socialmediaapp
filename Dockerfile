FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
COPY discover-library.json ./
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
EXPOSE 3000
# Set SEED_DEMO=1 to load the demo accounts on startup.
CMD ["sh", "-c", "if [ \"$SEED_DEMO\" = \"1\" ]; then node server/seed.js; fi; exec node server/index.js"]
