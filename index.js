const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('public'));
const port = 3001;

let db;

async function setupDatabase(filename = './menu_cache.db') {
  db = await open({ filename, driver: sqlite3.Database });
  await db.exec(`CREATE TABLE IF NOT EXISTS menu_cache (id INTEGER PRIMARY KEY, url TEXT, date TEXT, menu_json TEXT, UNIQUE(url, date))`);
  console.log('Database is ready.');
}

async function getMenuFromText(text, url) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const prompt = `
    Jsi expert na extrakci dat. Tvým úkolem je analyzovat text z webu restaurace a najít denní/polední menu.

    POSTUPUJ KROK ZA KROKEM:
    1. Projdi text a identifikuj blok, který nejvíce odpovídá dennímu menu. Ignoruj navigaci, patičky a stálý jídelní lístek. Hledej klíčová slova jako 'Denní menu', 'Polední nabídka'.
    2. Z tohoto bloku extrahuj jídla.
    3. Výsledek zformátuj do JSON objektu.

    Výsledný JSON musí PŘESNĚ odpovídat této struktuře:
    {
      "restaurant_name": "string",
      "menu_items": [
        { "category": "string", "name": "string", "price": "number|null", "weight": "string|undefined", "is_vegetarian": "boolean", "is_vegan": "boolean" }
      ],
      "daily_menu": "boolean",
      "source_url": "string"
    }

    PŘÍKLAD (text obsahuje hodně balastu):
    VSTUP:
    ---
    Menu Jídelní lístek Kontakt Polední nabídka: Polévka: Kulajda 35 Kč. Hlavní jídlo: 150g Vepřo knedlo zelo 150 Kč. O nás
    ---
    VÝSTUP:
    ---json
    {
      "restaurant_name": "Restaurace z URL",
      "menu_items": [
        { "category": "Polévka", "name": "Kulajda", "price": 35 },
        { "category": "Hlavní jídlo", "name": "Vepřo knedlo zelo", "price": 150, "weight": "150g" }
      ],
      "daily_menu": true,
      "source_url": "${url}"
    }
    ---

    DŮLEŽITÉ POKYNY:
    - 'is_vegetarian' a 'is_vegan': Na základě názvu a popisu jídla urči, zda je vegetariánské nebo veganské.
    - 'date': Pokud najdeš datum, VŽDY ho vrať ve formátu YYYY-MM-DD. Pokud datum nenajdeš, pole 'date' vůbec nevracej.
    - Pokud nenajdeš žádné denní menu, vrať 'menu_items' jako prázdné pole [].
    - 'restaurant_name': Najdi v textu, jinak odvoď z URL.
    - 'weight': Extrahuj z názvu jídla.

    Nyní analyzuj skutečný text:
    ---
    ${text.substring(0, 25000)}
    ---
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const jsonText = response.text().replace(/```json|```/g, '').trim();
    const parsedData = JSON.parse(jsonText);

    // Add today's date ONLY if AI found a daily menu but not a specific date
    if (parsedData.daily_menu && !parsedData.date) {
      parsedData.date = new Date().toISOString().split('T')[0];
    }

    return parsedData;
}

app.post('/summarize', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const today = new Date().toISOString().split('T')[0];

  try {
    const cached = await db.get('SELECT menu_json FROM menu_cache WHERE url = ? AND date = ?', [url, today]);
    if (cached) {
      console.log(`[CACHE] HIT for ${url}`);
      return res.json(JSON.parse(cached.menu_json));
    }
    console.log(`[CACHE] MISS for ${url}`);

    console.log(`[SCRAPER] Fetching ${url}`);
    const { data: html } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }});
    const $ = cheerio.load(html);
    const mainContent = $('body').text().replace(/\s\s+/g, ' ').trim();
    console.log(`[SCRAPER] Extracted ${mainContent.length} characters.`);

    console.log('[GEMINI] Extracting menu...');
    const menuData = await getMenuFromText(mainContent, url);

    if (menuData && Array.isArray(menuData.menu_items)) {
        await db.run('INSERT INTO menu_cache (url, date, menu_json) VALUES (?, ?, ?)', [url, today, JSON.stringify(menuData)]);
        console.log(`[CACHE] Wrote to cache for ${url}`);
        return res.json(menuData);
    } else {
        throw new Error('AI response is malformed.');
    }
  } catch (error) {
    console.error('[API_ERROR]', error.message);
    res.status(500).json({ error: 'Failed to process the request.', details: error.message });
  }
});

// --- SERVER START ---
// This part only runs when the file is executed directly, not when imported for tests
if (require.main === module) {
  app.listen(port, async () => {
    await setupDatabase();
    console.log(`Server is running on http://localhost:${port}`);
  });
}

module.exports = { app, setupDatabase }; // Export for testing
