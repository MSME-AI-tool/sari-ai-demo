# SARI-AI demo

This web app opens directly to **Your Store** on desktop or mobile. It uses one shared demo store seeded with fictional products, transactions, and expenses. A deployment with open access lets visitors change the same demo data.

## Run locally

From the `sari-ai` directory, run:

```sh
npm ci
npm run typecheck
npm run build
python main.py
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). The local server uses Python 3.13 and SQLite. The database is seeded once on first start. Set `SARI_AI_DB` to a different file path to start an independent demo.

For frontend development, keep Python running and use `npm run dev` in a second terminal. Vite proxies requests to the Python server. Run `python -B -m unittest` for the assistant and transaction checks.

## Deploy to Render

Render can create the web service and PostgreSQL database from `render.yaml` at the repository root. The Docker build compiles the web app and runs the Python API with Gunicorn. Render sets `DATABASE_URL` from the PostgreSQL service and shares one HTTPS origin for the UI and API.

The blueprint uses Render's free demo plans. Free web services can cold-start, and free Render Postgres expires after 30 days. Use a persistent database plan for records that need to survive beyond the demo.

### Configure Ask Sari

Set these secrets in the SARI-AI web service's **Environment** on Render, or in the environment that starts the local backend.

| Secret | Provider | Model |
| --- | --- | --- |
| `GROQ_API_KEY` | Groq | `openai/gpt-oss-20b` |
| `OPENROUTER_API_KEY` | OpenRouter | `nvidia/nemotron-3.5-super-vl:free` |

Sari tries Groq first, then OpenRouter if Groq cannot return a usable reply. Either key works on its own. If the configured providers are unavailable, Sari uses store records and app guidance. Model replies display **Live AI**. Run `python smoke_agents.py https://YOUR-SERVICE.onrender.com` for read-only checks of all four agents.

The backend sends the submitted question and relevant store figures or product names to the configured provider. Use fictional data for the demo, including in the questions.

Use the language menu to switch between English and Filipino. Product names, units, and catalog categories stay as entered.

Recording is available on Sales, Stock, Expenses, and Ledger. Users can type, use the browser's speech recognition where supported, or read a receipt or product label on Stock. Photo lookup reads package text and suggests matching catalog names. Receipt OCR runs in the browser and produces a draft for review. Confirm the quantity, unit, and price against the original receipt before saving.

Home, Sales, and Expenses show charts and summaries computed from records. Stock includes the planner for reorder timing, quantities, and price or new-product scenarios. Home flags inventory and cash issues with links to the affected records. Ask Sari handles general questions without an agent selector. Saving a draft displays the amount and stock or credit changes, with a link to the record.

## Demo flow

1. Open **Home** for today’s sales, the change since yesterday, expenses, and the seven-day sales trend.
2. Type **Dagdag 24 na kape.** into Notebook entry, then review Sari’s proposed change before saving. For bulk entry, open **Stock → Enter multiple notebook rows** and paste rows in the format `Product name, quantity, optional note`. Choose physical count, stock-in, or wastage. Review the draft before saving. Stock history shows the date, source note, change, and quantity after each entry.
3. Record a checkout and see sales and available stock update. Cash and credit sales share one checkout. Repayments appear in cash received.
4. In **Ask Sari**, try "Which product sold most?", "What needs restocking?", "Check my records", or "Restock 20 Coffee sachets." Open **View store figures** on an analysis response to see the calculations behind it.

Stock cover uses the last seven complete days of sales and requires sales on at least three distinct days. Record checks flag products with zero unit costs and count corrections of at least ten units. Online access is required to save records.
