# Utilisation de l'image officielle Playwright (Ubuntu Jammy) - La plus stable
FROM mcr.microsoft.com/playwright:v1.40.1-jammy

# Créer le dossier de l'app
WORKDIR /usr/src/app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances (npm install est plus tolérant que npm ci)
RUN npm install --production

# Installer le navigateur Chromium
RUN npx playwright install chromium

# Copier le reste du code
COPY . .

# Créer le dossier logs pour éviter les erreurs d'écriture
RUN mkdir -p logs

# Port par défaut
EXPOSE 3000

# Lancement
CMD ["node", "server.js"]
