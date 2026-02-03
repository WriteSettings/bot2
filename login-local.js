// ============================================================
// login-local.js
// ============================================================
// Ce script tourne sur TA MACHINE (pas sur le serveur).
// Il ouvre un Chrome visible, tu te connectes à LinkedIn,
// puis il sauvegarde la session dans linkedin-session.json.
// Tu ensuites upload ce fichier sur le serveur via /setup-login.
//
// Prérequis : npm install playwright-core (ou playwright)
//   npm install playwright
//   node login-local.js
// ============================================================

const { chromium } = require('playwright');
const path         = require('path');

const SESSION_FILE = path.join(__dirname, 'linkedin-session.json');
const WAIT_SECONDS = 45;

(async () => {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' 🔐  Login LinkedIn — session locale');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(' 1️⃣  Un Chrome va s\'ouvrir automatiquement.');
  console.log(' 2️⃣  Connecte-toi à LinkedIn dans ce Chrome.');
  console.log(` 3️⃣  Attends qu'il arrive sur ton fil d'actualité.`);
  console.log(` 4️⃣  Dans ${WAIT_SECONDS}s le fichier sera sauvegardé.`);
  console.log('');
  console.log(' ⚠️  Ne ferme PAS la fenêtre Chrome manuellement.');
  console.log('');

  // Lance un Chrome VISIBLE (headless: false) — c'est ok, c'est ta machine locale
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled',
      '--disable-automation',
      '--disable-infobars'
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
             + 'AppleWebKit/537.36 (KHTML, like Gecko) '
             + 'Chrome/120.0.0.0 Safari/537.36',
    viewport:  { width: 1920, height: 1080 },
    locale:    'fr-FR',
    timezoneId:'Europe/Paris'
  });

  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'networkidle' });

  // compte à rebours dans le terminal
  for (let i = WAIT_SECONDS; i > 0; i--) {
    const connected = await page.url().includes('/feed') || await page.url().includes('/mynetwork');
    if (connected) {
      console.log(' ✅  Connexion détectée !');
      break;
    }
    process.stdout.write(`\r ⏳  Attente… ${i}s restant(es)   `);
    await new Promise(r => setTimeout(r, 1000));
  }

  // Sauvegarde
  await context.storageState({ path: SESSION_FILE });
  console.log('');
  console.log(` ✅  Session sauvegardée → ${SESSION_FILE}`);
  console.log('');
  console.log(' 📤  Vas sur /setup-login sur ton serveur');
  console.log('     et upload ce fichier.');
  console.log('');

  await browser.close();
  process.exit(0);
})();
