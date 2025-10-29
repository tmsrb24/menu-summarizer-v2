const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const cron = require('node-cron');
const { App: BoltApp } = require('@slack/bolt');

require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('public'));
const port = 3001;

let db;

async function setupDatabase() {
  db = await open({ filename: './menu_cache.db', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS menu_cache (id INTEGER PRIMARY KEY, url TEXT, date TEXT, menu_json TEXT, UNIQUE(url, date));
    CREATE TABLE IF NOT EXISTS webhooks (id INTEGER PRIMARY KEY, restaurant_url TEXT NOT NULL, webhook_url TEXT NOT NULL, UNIQUE(restaurant_url, webhook_url));
  `);
  console.log('Database is ready.');
}

async function summarizeUrl(url, force_refresh = false) {
  const today = new Date().toISOString().split('T')[0];

  if (!force_refresh) {
    const cached = await db.get('SELECT menu_json FROM menu_cache WHERE url = ? AND date = ?', [url, today]);
    if (cached) {
      console.log(`[CACHE] HIT for ${url}`);
      return JSON.parse(cached.menu_json);
    }
  }
  console.log(`[CACHE] MISS for ${url}`);

  console.log(`[SCRAPER] Fetching ${url}`);
  const { data: html } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }});
  const $ = cheerio.load(html);
  const mainContent = $('body').text().replace(/\s\s+/g, ' ').trim();
  console.log(`[SCRAPER] Extracted ${mainContent.length} characters.`);

  console.log('[GEMINI] Extracting menu...');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const prompt = `
    Jsi expert na analýzu jídelních lístků. Analyzuj text, najdi denní menu a pro každé jídlo odhadni kalorie a přiřaď zdravotní skóre.
    Vrať POUZE JSON objekt.
    Struktura: { "restaurant_name": string, "menu_items": [{ "category": string, "name": string, "price": number|null, "is_vegetarian": boolean, "is_vegan": boolean, "calories": number|null, "health_score": number|null (1-5) }], "daily_menu": boolean, "is_closed": boolean|undefined, "source_url": "${url}" }
    POKYNY:
    - 'calories': Odhadni kalorie.
    - 'health_score': Ohodnoť zdravost jídla na škále 1-5.
    - 'is_closed': Pokud je restaurace zavřená, nastav na true.
    - Týdenní menu: Extrahuj jídla pro všechny dny.
    - Pokud menu nenajdeš, 'menu_items' bude [].
    Text k analýze: ${mainContent.substring(0, 25000)}
  `;
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const jsonText = response.text().replace(/```json|```/g, '').trim();
  const menuData = JSON.parse(jsonText);

  if (menuData && Array.isArray(menuData.menu_items)) {
      await db.run('INSERT OR REPLACE INTO menu_cache (url, date, menu_json) VALUES (?, ?, ?)', [url, today, JSON.stringify(menuData)]);
      console.log(`[CACHE] Wrote to cache for ${url}`);
      return menuData;
  } else {
      throw new Error('AI response is malformed.');
  }
}

app.post('/summarize', async (req, res) => {
  try {
    const menuData = await summarizeUrl(req.body.url);
    res.json(menuData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to process.', details: error.message });
  }
});

app.post('/webhooks/register', async (req, res) => {
  const { restaurant_url, webhook_url } = req.body;
  try {
    await db.run('INSERT INTO webhooks (restaurant_url, webhook_url) VALUES (?, ?)', [restaurant_url, webhook_url]);
    res.status(201).json({ message: 'Webhook registered.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to register.', details: error.message });
  }
});

app.post('/webhooks/unregister', async (req, res) => {
    const { restaurant_url, webhook_url } = req.body;
    try {
      await db.run('DELETE FROM webhooks WHERE restaurant_url = ? AND webhook_url = ?', [restaurant_url, webhook_url]);
      res.status(200).json({ message: 'Webhook unregistered.' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to unregister.', details: error.message });
    }
});

cron.schedule('0 * * * *', async () => {
  console.log('[CRON] Running webhook check...');
  const today = new Date().toISOString().split('T')[0];
  const webhooks = await db.all('SELECT restaurant_url, webhook_url FROM webhooks');
  const urlsToCheck = [...new Set(webhooks.map(w => w.restaurant_url))];

  for (const url of urlsToCheck) {
    try {
      const oldMenuRaw = await db.get('SELECT menu_json FROM menu_cache WHERE url = ? AND date = ?', [url, today]);
      const newMenu = await summarizeUrl(url, true);

      if (oldMenuRaw && JSON.stringify(JSON.parse(oldMenuRaw.menu_json).menu_items) !== JSON.stringify(newMenu.menu_items)) {
        console.log(`[CRON] Change detected for ${url}!`);
        const subscribers = webhooks.filter(w => w.restaurant_url === url);
        subscribers.forEach(sub => {
          console.log(`[CRON] Sending notification to ${sub.webhook_url}`);
          axios.post(sub.webhook_url, { new_menu: newMenu }).catch(err => console.error(`[WEBHOOK_SEND_ERROR]`, err.message));
        });
      }
    } catch (error) {
      console.error(`[CRON_ERROR] Failed to check ${url}:`, error.message);
    }
  }
});

(async () => {
  await setupDatabase();

  if (process.env.SLACK_BOT_TOKEN && !process.env.SLACK_BOT_TOKEN.includes('YOUR-TOKEN-HERE')) {
    const boltApp = new BoltApp({
      token: process.env.SLACK_BOT_TOKEN,
      signingSecret: process.env.SLACK_SIGNING_SECRET,
      socketMode: true,
      appToken: process.env.SLACK_APP_TOKEN, 
    });
    // Slack logic here...
    await boltApp.start();
    console.log('⚡️ Slack Bolt app is running!');
  } else {
    console.log('Slack bot tokens not found, skipping.');
  }

  app.listen(port, () => {
    console.log(`🚀 Express server is running on http://localhost:${port}`);
  });
})();
