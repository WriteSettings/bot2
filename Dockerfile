# ─────────────────────────────────────────────────────────────
# node:18-slim = Debian.  PAS Alpine.
# Alpine manque libgbm, libxkbcommon et d'autres libs que
# Chromium a besoin même en headless.  Debian les a.
# ─────────────────────────────────────────────────────────────
FROM node:18-slim

# Dépendances système que Chromium (headless) a besoin
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      fonts-liberation \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libcairo2.0-1 \
      libcups2 \
      libdrm2 \
      libgbm1 \
      libglib2.0-0 \
      libgtk-3-0 \
      libnspr4 \
      libnss3 \
      libpango-1.0-0 \
      libxcomposite1 \
      libxdamage1 \
      libxfixes3 \
      libxkbcommon0 \
      libxrandr2 \
      libxslt1.1 \
      wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1) installe les dépendances npm
COPY package*.json ./
RUN npm ci --only=production

# 2) télécharge le Chromium que Playwright veut — une seule fois, pendant le build.
#    On NE met PAS PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD.
#    On NE met PAS PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
#    Playwright sait où trouver son propre navigateur.
RUN npx playwright install chromium

# 3) copie le reste du code
COPY . .
RUN mkdir -p logs

EXPOSE 3000
CMD ["node", "server.js"]
