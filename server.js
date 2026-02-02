const express = require('express');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// Configuration
const PORT = process.env.PORT || 3000;
const SESSION_FILE = path.join(__dirname, 'linkedin-session.json');
const LOGS_DIR = path.join(__dirname, 'logs');

// Créer dossier logs si n'existe pas
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR);
}

// Fonction de logging
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}\n`;
  
  console.log(logMessage.trim());
  
  // Sauvegarde dans fichier
  const logFile = path.join(LOGS_DIR, `bot-${new Date().toISOString().split('T')[0]}.log`);
  fs.appendFileSync(logFile, logMessage);
}

// Fonction principale d'envoi de message LinkedIn
async function sendLinkedInMessage(profileUrl, message, options = {}) {
  let browser;
  const startTime = Date.now();
  
  try {
    log(`🚀 Démarrage envoi message vers: ${profileUrl}`);
    
    // Lance navigateur avec options anti-détection
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security'
      ]
    });
    
    // Configuration du contexte avec session sauvegardée
    let context;
    if (fs.existsSync(SESSION_FILE)) {
      log('✅ Session LinkedIn trouvée, chargement...');
      context = await browser.newContext({
        storageState: SESSION_FILE,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'fr-FR',
        timezoneId: 'Europe/Paris'
      });
    } else {
      log('⚠️ Aucune session LinkedIn trouvée!');
      throw new Error('Session LinkedIn non configurée. Exécute d\'abord /setup-login');
    }
    
    const page = await context.newPage();
    
    // Désactive l'indicateur webdriver
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
    });
    
    // Navigation vers le profil
    log(`🌐 Navigation vers ${profileUrl}`);
    await page.goto(profileUrl, { 
      waitUntil: 'networkidle',
      timeout: 45000 
    });
    
    // Délai humain aléatoire
    const randomDelay = 2000 + Math.random() * 3000;
    log(`⏱️ Délai humain: ${Math.round(randomDelay)}ms`);
    await page.waitForTimeout(randomDelay);
    
    // Vérification si connecté
    const isLoggedIn = await page.locator('nav[aria-label="Navigation principale"]').count() > 0;
    if (!isLoggedIn) {
      throw new Error('Session LinkedIn expirée ou invalide');
    }
    
    log('✅ Connecté à LinkedIn');
    
    // Recherche bouton Message (plusieurs variantes)
    const messageSelectors = [
      'button.pvs-profile-actions__action:has-text("Message")',
      'button:has-text("Message")',
      'button:has-text("Envoyer un message")',
      'a[href*="messaging/thread"]',
      '.message-anywhere-button',
      'button[aria-label*="Message"]'
    ];
    
    let messageButton = null;
    for (const selector of messageSelectors) {
      try {
        const locator = page.locator(selector).first();
        if (await locator.isVisible({ timeout: 2000 })) {
          messageButton = locator;
          log(`✅ Bouton Message trouvé avec: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!messageButton) {
      // Essaye de scroller pour charger le bouton
      await page.evaluate(() => window.scrollBy(0, 300));
      await page.waitForTimeout(1000);
      
      // Re-essaye
      for (const selector of messageSelectors) {
        try {
          const locator = page.locator(selector).first();
          if (await locator.isVisible({ timeout: 2000 })) {
            messageButton = locator;
            break;
          }
        } catch (e) {
          continue;
        }
      }
    }
    
    if (!messageButton) {
      throw new Error('❌ Bouton Message introuvable sur le profil. Vérifiez que vous êtes connectés.');
    }
    
    // Clique sur Message
    log('🖱️ Clic sur bouton Message');
    await messageButton.click();
    await page.waitForTimeout(1500 + Math.random() * 1500);
    
    // Attend que la boîte de message apparaisse
    const textBoxSelectors = [
      'div[role="textbox"]',
      'div.msg-form__contenteditable',
      'div.msg-form__msg-content-container',
      'p[data-placeholder="Écrire un message..."]'
    ];
    
    let textBox = null;
    for (const selector of textBoxSelectors) {
      try {
        const locator = page.locator(selector).first();
        await locator.waitFor({ state: 'visible', timeout: 5000 });
        textBox = locator;
        log(`✅ Zone de texte trouvée avec: ${selector}`);
        break;
      } catch (e) {
        continue;
      }
    }
    
    if (!textBox) {
      throw new Error('❌ Zone de texte message introuvable');
    }
    
    // Focus sur la zone de texte
    await textBox.click();
    await page.waitForTimeout(500);
    
    // Tape message caractère par caractère (simulation humaine)
    log('⌨️ Écriture du message...');
    for (let i = 0; i < message.length; i++) {
      const char = message[i];
      await textBox.type(char, { 
        delay: 30 + Math.random() * 70 
      });
      
      // Pause aléatoire tous les 10-20 caractères (comme un humain)
      if (i > 0 && i % (10 + Math.floor(Math.random() * 10)) === 0) {
        await page.waitForTimeout(200 + Math.random() * 300);
      }
    }
    
    log('✅ Message rédigé');
    
    // Délai avant envoi (comme un humain qui relit)
    await page.waitForTimeout(1000 + Math.random() * 2000);
    
    // Recherche bouton Envoyer
    const sendSelectors = [
      'button[type="submit"]:has-text("Envoyer")',
      'button.msg-form__send-button',
      'button:has-text("Envoyer")',
      'button[aria-label="Envoyer"]'
    ];
    
    let sendButton = null;
    for (const selector of sendSelectors) {
      try {
        const locator = page.locator(selector).first();
        if (await locator.isVisible({ timeout: 2000 })) {
          sendButton = locator;
          log(`✅ Bouton Envoyer trouvé avec: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!sendButton) {
      throw new Error('❌ Bouton Envoyer introuvable');
    }
    
    // Envoie le message
    log('📤 Envoi du message...');
    await sendButton.click();
    
    // Attend confirmation d'envoi
    await page.waitForTimeout(2000);
    
    // Vérifie que le message est envoyé (champ de texte vide)
    const textContent = await textBox.textContent();
    if (textContent && textContent.length > 10) {
      log('⚠️ Le message semble ne pas être envoyé (texte toujours présent)');
    } else {
      log('✅ Message envoyé avec succès!');
    }
    
    // Sauvegarde session mise à jour
    await context.storageState({ path: SESSION_FILE });
    log('💾 Session LinkedIn sauvegardée');
    
    await browser.close();
    
    const duration = Date.now() - startTime;
    log(`✅ Processus terminé en ${duration}ms`);
    
    return {
      success: true,
      profileUrl: profileUrl,
      timestamp: new Date().toISOString(),
      duration: duration,
      message: 'Message envoyé avec succès'
    };
    
  } catch (error) {
    log(`❌ ERREUR: ${error.message}`, 'error');
    
    if (browser) {
      await browser.close();
    }
    
    return {
      success: false,
      profileUrl: profileUrl,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// Fonction de lecture des messages reçus
async function checkLinkedInMessages() {
  let browser;
  
  try {
    log('📬 Vérification des messages LinkedIn...');
    
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    if (!fs.existsSync(SESSION_FILE)) {
      throw new Error('Session LinkedIn non configurée');
    }
    
    const context = await browser.newContext({
      storageState: SESSION_FILE,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      locale: 'fr-FR'
    });
    
    const page = await context.newPage();
    
    // Va sur la page messages
    await page.goto('https://www.linkedin.com/messaging/', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    await page.waitForTimeout(3000);
    
    // Récupère les conversations non lues
    const conversations = await page.locator('.msg-conversations-container__convo-item--unread').all();
    
    const messages = [];
    
    for (let i = 0; i < Math.min(conversations.length, 5); i++) {
      try {
        await conversations[i].click();
        await page.waitForTimeout(1500);
        
        // Extrait nom
        const name = await page.locator('.msg-thread__profile-link').first().textContent();
        
        // Extrait dernier message
        const lastMessage = await page.locator('.msg-s-message-list__event').last().textContent();
        
        // Extrait URL profil
        const profileLink = await page.locator('.msg-thread__profile-link').first().getAttribute('href');
        
        messages.push({
          name: name.trim(),
          message: lastMessage.trim(),
          profileUrl: `https://www.linkedin.com${profileLink}`,
          timestamp: new Date().toISOString()
        });
        
      } catch (e) {
        log(`⚠️ Erreur lecture conversation ${i}: ${e.message}`, 'warning');
      }
    }
    
    await context.storageState({ path: SESSION_FILE });
    await browser.close();
    
    log(`✅ ${messages.length} nouveau(x) message(s) récupéré(s)`);
    
    return {
      success: true,
      count: messages.length,
      messages: messages
    };
    
  } catch (error) {
    log(`❌ Erreur vérification messages: ${error.message}`, 'error');
    
    if (browser) await browser.close();
    
    return {
      success: false,
      error: error.message
    };
  }
}

// === ROUTES API ===

// Route principale
app.get('/', (req, res) => {
  res.json({
    status: 'active',
    name: 'LinkedIn Automation Bot',
    version: '1.0.0',
    endpoints: {
      '/send-message': 'POST - Envoie un message LinkedIn',
      '/check-messages': 'GET - Vérifie les messages reçus',
      '/setup-login': 'GET - Configuration initiale de la session LinkedIn',
      '/health': 'GET - Statut du serveur',
      '/logs': 'GET - Logs récents'
    }
  });
});

// Endpoint pour n8n - Envoi de message
app.post('/send-message', async (req, res) => {
  const { profileUrl, message, callbackUrl } = req.body;
  
  if (!profileUrl || !message) {
    return res.status(400).json({
      success: false,
      error: 'profileUrl et message requis'
    });
  }
  
  log(`📨 Nouvelle requête d'envoi: ${profileUrl}`);
  
  // Si callbackUrl fourni, traitement asynchrone
  if (callbackUrl) {
    res.json({ 
      status: 'processing',
      profileUrl: profileUrl,
      message: 'Traitement en cours...'
    });
    
    // Envoi en background
    const result = await sendLinkedInMessage(profileUrl, message);
    
    // Callback vers n8n
    try {
      const fetch = (await import('node-fetch')).default;
      await fetch(callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      });
      log(`✅ Callback envoyé à ${callbackUrl}`);
    } catch (e) {
      log(`❌ Erreur callback: ${e.message}`, 'error');
    }
    
  } else {
    // Traitement synchrone
    const result = await sendLinkedInMessage(profileUrl, message);
    res.json(result);
  }
});

// Endpoint vérification messages
app.get('/check-messages', async (req, res) => {
  const result = await checkLinkedInMessages();
  res.json(result);
});

// Endpoint setup login initial
app.get('/setup-login', async (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Configuration LinkedIn Bot</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
          max-width: 800px;
          margin: 50px auto;
          padding: 20px;
          background: #f5f5f5;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
          color: #0077B5;
          margin-bottom: 30px;
        }
        .step {
          margin: 20px 0;
          padding: 15px;
          background: #f9f9f9;
          border-left: 4px solid #0077B5;
        }
        button {
          background: #0077B5;
          color: white;
          border: none;
          padding: 15px 30px;
          font-size: 16px;
          border-radius: 5px;
          cursor: pointer;
          margin-top: 20px;
        }
        button:hover {
          background: #005885;
        }
        .status {
          margin-top: 20px;
          padding: 15px;
          border-radius: 5px;
          display: none;
        }
        .status.success {
          background: #d4edda;
          color: #155724;
          display: block;
        }
        .status.error {
          background: #f8d7da;
          color: #721c24;
          display: block;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔧 Configuration LinkedIn Bot</h1>
        
        <div class="step">
          <strong>📋 Étape 1:</strong> Ouvre LinkedIn dans un nouvel onglet et connecte-toi
        </div>
        
        <div class="step">
          <strong>⏱️ Étape 2:</strong> Attends d'être complètement connecté (tu vois ton fil d'actualité)
        </div>
        
        <div class="step">
          <strong>💾 Étape 3:</strong> Reviens ici et clique sur "Sauvegarder Session"
        </div>
        
        <button onclick="saveSession()">
          💾 Sauvegarder Session LinkedIn
        </button>
        
        <div id="status" class="status"></div>
      </div>
      
      <script>
        async function saveSession() {
          const statusDiv = document.getElementById('status');
          statusDiv.textContent = '⏳ Sauvegarde en cours...';
          statusDiv.className = 'status';
          
          try {
            const response = await fetch('/save-session');
            const result = await response.json();
            
            if (result.success) {
              statusDiv.textContent = '✅ ' + result.message;
              statusDiv.className = 'status success';
            } else {
              statusDiv.textContent = '❌ ' + result.error;
              statusDiv.className = 'status error';
            }
          } catch (error) {
            statusDiv.textContent = '❌ Erreur: ' + error.message;
            statusDiv.className = 'status error';
          }
        }
      </script>
    </body>
    </html>
  `);
});

// Endpoint sauvegarde session
app.get('/save-session', async (req, res) => {
  let browser;
  
  try {
    log('🔐 Tentative de sauvegarde session LinkedIn...');
    
    browser = await chromium.launch({ 
      headless: false,
      args: ['--no-sandbox']
    });
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      locale: 'fr-FR'
    });
    
    const page = await context.newPage();
    await page.goto('https://www.linkedin.com/feed/');
    
    log('⏳ Attente 60 secondes pour login manuel...');
    await page.waitForTimeout(60000);
    
    // Sauvegarde
    await context.storageState({ path: SESSION_FILE });
    await browser.close();
    
    log('✅ Session LinkedIn sauvegardée avec succès!');
    
    res.json({
      success: true,
      message: 'Session LinkedIn sauvegardée! Le bot est prêt à être utilisé.'
    });
    
  } catch (error) {
    log(`❌ Erreur sauvegarde session: ${error.message}`, 'error');
    
    if (browser) await browser.close();
    
    res.json({
      success: false,
      error: error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  const hasSession = fs.existsSync(SESSION_FILE);
  
  res.json({
    status: 'ok',
    sessionConfigured: hasSession,
    timestamp: new Date().toISOString()
  });
});

// Logs récents
app.get('/logs', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const logFile = path.join(LOGS_DIR, `bot-${today}.log`);
  
  if (fs.existsSync(logFile)) {
    const logs = fs.readFileSync(logFile, 'utf-8');
    const lines = logs.split('\n').slice(-50); // 50 dernières lignes
    
    res.send(`
      <pre style="background: #1e1e1e; color: #dcdcdc; padding: 20px; font-family: 'Courier New', monospace;">
${lines.join('\n')}
      </pre>
    `);
  } else {
    res.send('Aucun log pour aujourd\'hui');
  }
});

// Démarrage serveur
app.listen(PORT, () => {
  log(`🚀 Bot LinkedIn démarré sur port ${PORT}`);
  log(`📍 URL: http://localhost:${PORT}`);
  log(`🔧 Setup: http://localhost:${PORT}/setup-login`);
  
  if (!fs.existsSync(SESSION_FILE)) {
    log('⚠️ Session LinkedIn non configurée. Va sur /setup-login pour configurer.', 'warning');
  } else {
    log('✅ Session LinkedIn chargée et prête');
  }
});

// Gestion des erreurs non catchées
process.on('uncaughtException', (error) => {
  log(`💥 Uncaught Exception: ${error.message}`, 'error');
});

process.on('unhandledRejection', (reason, promise) => {
  log(`💥 Unhandled Rejection: ${reason}`, 'error');
});
