# Restaurant Menu Summarizer

Tato aplikace slouží k extrakci, analýze a zobrazení denních menu z webových stránek restaurací pomocí umělé inteligence.

## Co aplikace umí

*   **Analýza menu z URL:** Zadejte URL adresu jídelního lístku a aplikace se pokusí extrahovat denní/polední menu.
*   **Strukturovaný výstup:** Výsledkem je přehledný, strukturovaný seznam jídel rozdělených do kategorií.
*   **Inteligentní analýza:** Aplikace využívá AI (Google Gemini) k odhadu nutričních hodnot a dalších atributů:
    *   Detekce **vegetariánských** a **veganských** jídel.
    *   Odhad **počtu kalorií**.
    *   Přiřazení **zdravotního skóre** (1-5).
*   **Filtrování alergenů:** Umožňuje interaktivně filtrovat zobrazená jídla podle alergenů.
*   **Cachování:** Výsledky se ukládají do lokální SQLite databáze, aby se předešlo opakovaným a zbytečným dotazům.
*   **Slack Bot (Volitelné):** Obsahuje připravenou integraci pro Slack. Po nastavení tokenů můžete posílat URL přímo botovi ve Slacku.

## Technologický stack

### Backend
*   **Runtime:** Node.js
*   **Framework:** Express.js
*   **Scraping:** Axios (pro stahování HTML) & Cheerio (pro parsování)
*   **AI:** Google Gemini (model `gemini-2.0-flash`)
*   **Databáze (Cache):** SQLite 3
*   **Testování:** Jest, Supertest

### Frontend
*   **Knihovna:** React
*   **Stylování:** Tailwind CSS
*   **Bundler:** Webpack

## Instalace a spuštění

1.  **Naklonujte repozitář:**
    ```bash
    git clone https://github.com/tmsrb24/menu-summarizer-v2.git
    cd menu-summarizer-v2
    ```

2.  **Nainstalujte závislosti pro backend i frontend:**
    ```bash
    npm install
    cd frontend
    npm install
    cd ..
    ```

3.  **Nastavte prostředí:**
    *   Vytvořte soubor `.env` v kořenovém adresáři projektu.
    *   Vložte do něj svůj API klíč pro Google Gemini:
      ```
      GEMINI_API_KEY="VASE_GEMINI_API_KEY_ZDE"
      ```
    *   (Volitelné) Pokud chcete spustit Slack bota, doplňte i `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` a `SLACK_APP_TOKEN`.

4.  **Spusťte aplikaci:**
    *   Tento příkaz spustí backend server (port 3001) i frontend server (port 3000) zároveň.
    ```bash
    npm run dev
    ```

5.  **Otevřete aplikaci v prohlížeči:**
    *   Jděte na adresu `http://localhost:3000`.

---

## Poznámky k implementaci

### Volba scraperu: Axios + Cheerio vs. Puppeteer

Aplikace používá kombinaci `axios` a `cheerio` místo plnohodnotného prohlížeče jako `Puppeteer`.

*   **Důvod:** Rychlost a efektivita. `axios` pouze stáhne HTML obsah, `cheerio` ho bleskově naparsuje. Tento přístup je výrazně rychlejší a méně náročný na systémové prostředky než spouštění celé instance prohlížeče.


### Volba cache: SQLite

Pro cachování byla zvolena jednoduchá souborová databáze SQLite.

*   **Důvod:** Pro lokální vývoj a jednoduchou aplikaci tohoto typu je SQLite ideální. Nevyžaduje žádnou instalaci ani konfiguraci databázového serveru (jako PostgreSQL nebo Redis). Databáze je jednoduše soubor na disku.
*   **Invalidace:** Cache je vázána na kombinaci `URL + datum`. Každý den se tedy pro danou URL stahuje menu znovu, což je pro denní menu ideální strategie.

### Řešení okrajových stavů (Edge Cases)

*   **Stránka není dostupná:** `axios` správně vyhodí chybu (např. 404 nebo timeout), kterou backend zachytí a vrátí na frontend srozumitelnou chybovou hlášku.
*   **Menu je pouze obrázek:** Současné řešení si s tímto neporadí, protože analyzuje pouze textový obsah. Řešením by bylo rozšíření o OCR (Optical Character Recognition) model, který by dokázal číst text z obrázků.

