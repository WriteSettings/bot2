# On utilise l'image officielle Playwright qui contient déjà TOUTES les dépendances
FROM mcr.microsoft.com/playwright:v1.40.1-jammy

# Dossier de travail
WORKDIR /usr/src/app

# Copie des fichiers de dépendances
COPY package*.json ./

# Installation propre (npm install est plus flexible que npm ci pour ce setup)
RUN npm install --production

# Installation forcée du navigateur Chromium dans le conteneur
RUN npx playwright install chromium

# Copie de tout le reste du code (server.js, etc.)
COPY . .

# Création du dossier pour les logs
RUN mkdir -p logs

# Port utilisé par server.js
EXPOSE 3000

# Lancement du serveur
CMD ["node", "server.js"]
