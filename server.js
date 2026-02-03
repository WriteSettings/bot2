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
    
    // Lance navigateur — headless:'new' + args obligatoires pour Linux sans display
    browser = await chromium.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
        '--no-zygote',
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
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
        '--no-zygote'
      ]
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


// ──────────────────────────────────────────────────────────
// /setup-login   →  page d'instructions + upload fichier session.
//
// Le login LinkedIn se fait LOCALEMENT via login-local.js.
// Le fichier linkedin-session.json résultant est ensuite
// uploadé sur ce serveur via le formulaire ci-dessous.
// Aucun navigateur n'est lancé ici.
// ──────────────────────────────────────────────────────────
app.get('/setup-login', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Setup Session LinkedIn</title>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; }
    body {
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      background:#f0f2f5; min-height:100vh;
      display:flex; align-items:flex-start; justify-content:center;
      padding:48px 20px;
    }
    .card {
      background:#fff; border-radius:12px; width:100%; max-width:680px;
      box-shadow:0 4px 20px rgba(0,0,0,.08); padding:40px;
    }
    h1 { color:#0077B5; font-size:1.6rem; margin-bottom:8px; }
    .sub { color:#666; margin-bottom:28px; font-size:.95rem; }
    .step {
      display:flex; gap:16px; align-items:flex-start;
      background:#f8fafc; border-radius:8px; padding:18px 20px;
      margin-bottom:12px; border-left:4px solid #0077B5;
    }
    .num {
      background:#0077B5; color:#fff; border-radius:50%;
      width:28px; height:28px; min-width:28px;
      display:flex; align-items:center; justify-content:center;
      font-weight:700; font-size:.9rem;
    }
    .txt strong { display:block; margin-bottom:3px; }
    .txt span  { color:#555; font-size:.9rem; line-height:1.5; }
    code {
      background:#eef2ff; color:#4338ca; padding:2px 7px;
      border-radius:4px; font-size:.88rem;
    }
    hr { border:none; border-top:2px dashed #e2e8f0; margin:24px 0; }
    .dropzone {
      border:2px dashed #cbd5e1; border-radius:10px;
      padding:36px 20px; text-align:center; cursor:pointer;
      transition:all .2s; margin-top:8px;
    }
    .dropzone:hover,.dropzone.over { border-color:#0077B5; background:#eef7fb; }
    .dropzone input { display:none; }
    .dropzone .ico { font-size:2rem; margin-bottom:8px; }
    .dropzone p  { color:#475569; font-size:.92rem; }
    .dropzone p strong { color:#0077B5; }
    .status { margin-top:16px; padding:14px 18px; border-radius:8px; display:none; font-size:.92rem; }
    .status.ok  { background:#dcfce7; color:#166534; display:block; }
    .status.err { background:#fee2e2; color:#991b1b; display:block; }
  </style>
</head>
<body>
<div class="card">
  <h1>&#128135; Configuration de la session LinkedIn</h1>
  <p class="sub">Le bot ne peut pas se connecter lui-même depuis le serveur cloud.<br>
     Tu fais le login une seule fois sur ta machine, puis tu envoyes le fichier ici.</p>

  <div class="step">
    <div class="num">1</div>
    <div class="txt">
      <strong>Télécharge login-local.js</strong>
      <span>Il est fourni avec le projet, même dossier que <code>server.js</code>.</span>
    </div>
  </div>

  <div class="step">
    <div class="num">2</div>
    <div class="txt">
      <strong>Exécute dans ton terminal</strong>
      <span><code>node login-local.js</code><br>
      Un Chrome s'ouvre — connecte-toi à LinkedIn normalement.<br>
      Après 30 s un fichier <code>linkedin-session.json</code> apparaît.</span>
    </div>
  </div>

  <div class="step">
    <div class="num">3</div>
    <div class="txt">
      <strong>Upload le fichier ci-dessous</strong>
      <span>Glisse <code>linkedin-session.json</code> sur la zone, ou clique pour le choisir.</span>
    </div>
  </div>

  <hr>

  <div class="dropzone" id="dz" onclick="document.getElementById('fi').click()">
    <div class="ico">&#128193;</div>
    <p><strong>Glisse linkedin-session.json ici</strong></p>
    <p>ou clique pour choisir le fichier</p>
    <input type="file" id="fi" accept=".json">
  </div>
  <div class="status" id="st"></div>
</div>

<script>
const dz=document.getElementById('dz'),
      fi=document.getElementById('fi'),
      st=document.getElementById('st');

function show(m,c){st.textContent=m;st.className='status '+c;}

async function upload(f){
  if(!f||!f.name.endsWith('.json')){show('❌ Fichier .json requis.','err');return;}
  show('⏳ Upload en cours…','');st.style.display='block';
  const fd=new FormData(); fd.append('session',f,'linkedin-session.json');
  try{
    const r=await fetch('/upload-session',{method:'POST',body:fd});
    const d=await r.json();
    show(d.success?'✅ Session uploadée — le bot est prêt !':'❌ '+d.error, d.success?'ok':'err');
  }catch(e){show('❌ Erreur réseau : '+e.message,'err');}
}

fi.addEventListener('change',e=>upload(e.target.files[0]));
dz.addEventListener('dragover', e=>{e.preventDefault();dz.classList.add('over');});
dz.addEventListener('dragleave',()=>dz.classList.remove('over'));
dz.addEventListener('drop',     e=>{e.preventDefault();dz.classList.remove('over');upload(e.dataTransfer.files[0]);});
</script>
</body>
</html>`);
});

// ──────────────────────────────────────────────────────────
// POST /upload-session  →  reçoit le fichier JSON (multipart),
// écrit linkedin-session.json sur le disque du serveur.
// Pas de dépendance externe (pas de multer) — le fichier
// est petit (< 50 KB).
// ──────────────────────────────────────────────────────────
app.post('/upload-session', (req, res) => {
  const chunks = [];
  req.on('data',  c => chunks.push(c));
  req.on('end', () => {
    try {
      const raw      = Buffer.concat(chunks).toString('utf8');
      const ct       = req.headers['content-type'] || '';
      const boundary = ct.includes('boundary=') ? ct.split('boundary=')[1] : null;

      if (!boundary) throw new Error('Pas de boundary multipart dans la requête');

      // découpe par boundary
      const parts = raw.split('--' + boundary);
      let jsonStr = null;

      for (const part of parts) {
        if (!part.includes('filename')) continue;
        // le contenu commence après le premier \r\n\r\n
        const sep = '\r\n\r\n';
        const idx = part.indexOf(sep);
        if (idx === -1) continue;

        let body = part.substring(idx + sep.length);
        // retirer le \r\n final avant le prochain boundary
        if (body.endsWith('\r\n')) body = body.slice(0, -2);

        jsonStr = body;
        break;
      }

      if (!jsonStr) throw new Error('Fichier session non trouvé dans la requête');

      // vérifie JSON valide avant d'écrire
      JSON.parse(jsonStr);

      fs.writeFileSync(SESSION_FILE, jsonStr);
      log('✅ Session LinkedIn uploadée via interface web');
      res.json({ success: true });

    } catch (e) {
      log('❌ upload-session : ' + e.message, 'error');
      res.json({ success: false, error: e.message });
    }
  });
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
