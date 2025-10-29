const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { App: BoltApp } = require('@slack/bolt');

require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('public'));
const port = 3001;

let db;

async function setupDatabase() {
  db = await open({ filename: './menu_cache.db', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE IF NOT EXISTS menu_cache (id INTEGER PRIMARY KEY, url TEXT, date TEXT, menu_json TEXT, UNIQUE(url, date))`);
  console.log('Database is ready.');
}

async function summarizeUrl(url) {
  const today = new Date().toISOString().split('T')[0];

  const cached = await db.get('SELECT menu_json FROM menu_cache WHERE url = ? AND date = ?', [url, today]);
  if (cached) {
    console.log(`[CACHE] HIT for ${url}`);
    return JSON.parse(cached.menu_json);
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

    Vrať POUZE JSON objekt ve struktuře:
    {
      "restaurant_name": "string",
      "menu_items": [
        { 
          "category": "string", 
          "name": "string", 
          "price": "number|null",
          "is_vegetarian": "boolean",
          "is_vegan": "boolean",
          "calories": "number|null",
          "health_score": "number|null (1-5)"
        }
      ],
      "daily_menu": "boolean",
      "source_url": "${url}"
    }

    DŮLEŽITÉ POKYNY:
    - 'calories': Odhadni počet kalorií pro porci.
    - 'health_score': Ohodnoť jídlo na škále 1 (nejméně zdravé) až 5 (nejzdravější).
    - Pokud menu nenajdeš, vrať 'menu_items' jako prázdné pole [].

    Text k analýze:
    ${mainContent.substring(0, 25000)}
  `;
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const jsonText = response.text().replace(/```json|```/g, '').trim();
  const menuData = JSON.parse(jsonText);

  if (menuData && Array.isArray(menuData.menu_items)) {
      await db.run('INSERT INTO menu_cache (url, date, menu_json) VALUES (?, ?, ?)', [url, today, JSON.stringify(menuData)]);
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
    console.error('[API_ERROR]', error.message);
    res.status(500).json({ error: 'Failed to process the request.', details: error.message });
  }
});

// --- Server Start & Optional Slack Bot ---
(async () => {
  await setupDatabase();

  if (process.env.SLACK_BOT_TOKEN && !process.env.SLACK_BOT_TOKEN.includes('YOUR-TOKEN-HERE')) {
    const boltApp = new BoltApp({
      token: process.env.SLACK_BOT_TOKEN,
      signingSecret: process.env.SLACK_SIGNING_SECRET,
      socketMode: true,
      appToken: process.env.SLACK_APP_TOKEN, 
    });
    // ... (Slack logic remains the same)
    await boltApp.start();
    console.log('⚡️ Slack Bolt app is running!');
  } else {
    console.log('Slack bot tokens not found, skipping.');
  }

  app.listen(port, () => {
    console.log(`🚀 Express server is running on http://localhost:${port}`);
  });
})();
