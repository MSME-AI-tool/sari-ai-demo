# SARI-AI demo

This online PWA opens directly to **Your Store**. It uses one shared demo store seeded with fictional products, transactions, and expenses. A deployment with open access lets visitors change the same demo data.

## Run locally

From the `sari-ai` directory, run:

```sh
npm ci
npm run typecheck
npm run build
python main.py
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). The local server uses Python 3.13 and SQLite. The database is seeded once on first start. Set `SARI_AI_DB` to a different file path to start an independent demo.

For frontend development, keep Python running and use `npm run dev` in a second terminal. Vite proxies requests to the Python server. Test installation and offline messaging with the production build.

## Deploy to Render

Render can create the web service and PostgreSQL database from `render.yaml` at the repository root. The Docker build compiles the PWA and runs the Python API with Gunicorn. Render sets `DATABASE_URL` from the PostgreSQL service and shares one HTTPS origin for the UI and API.

The blueprint uses Render's free demo plans. Free web services can cold-start, and free Render Postgres expires after 30 days. Use a persistent database plan for records that need to survive beyond the demo.

## Connect Ask AI to FreeLLMAPI

1. Set up the [FreeLLMAPI gateway](https://github.com/tashfeenahmed/freellmapi/blob/main/docs/en/install/01-install.md), configure an upstream provider, and copy the unified API key from the gateway's Keys page.
2. Set these variables on the SARI-AI backend. On Render, use the web service's Environment settings. For local Windows testing, use the same PowerShell session that starts `python main.py`.

   ```powershell
   $env:FREELLMAPI_BASE_URL = 'http://127.0.0.1:31415/v1'
   $env:FREELLMAPI_API_KEY = '<unified key from your FreeLLMAPI gateway>'
   $env:FREELLMAPI_MODEL = 'auto'
   ```

   Use an HTTPS gateway URL reachable from Render for the hosted demo. The model variable is optional and defaults to `auto`. Keep the unified key in the backend environment.

3. Open **Ask AI** and try one example for each agent. Live answers show **FreeLLMAPI** next to the agent name. A missing or unavailable gateway uses the labeled local fallback.

The backend sends the submitted question and either the relevant store aggregates or a compact product catalogue. Analytics requests exclude customer names, raw transactions, and notebook notes from the attached store context. Use fictional data for the demo, including in the questions. FreeLLMAPI's maintainers describe it as a gateway for personal experimentation. Check the enabled provider's terms before sharing access to a hosted demo.

Recording drafts typed sales, stock entries, and expenses. Insights explains recorded sales, cash, expenses, and gross profit. Forecast uses recent sales to explain stock cover. Health Monitor flags low stock, missing unit costs, and large physical-count corrections. The model has no write access. Drafts go through the editable form and are saved only after confirmation.

## Demo flow

1. Open **Home** for today’s sales, the change since yesterday, expenses, and the seven-day sales trend.
2. Type **Dagdag 24 na kape.** into Notebook entry, then review Suki’s proposed change before saving. For bulk entry, open **Stock → Enter multiple notebook rows** and paste rows in the format `Product name, quantity, optional note`. Choose physical count, stock-in, or wastage. Review the draft before saving. Stock history shows the date, source note, change, and quantity after each entry.
3. Record a checkout and see sales and available stock update. Cash and credit sales share one checkout. Repayments appear in cash received.
4. In **Ask AI**, try "Which product sold most?", "What needs restocking?", "Check my records", or "Restock 20 Coffee sachets." Open **View store figures** on an analysis response to see the calculations behind it.

Stock cover uses the last seven complete days of sales and requires sales on at least three distinct days. Record checks flag products with zero unit costs and count corrections of at least ten units. Online access is required to save records.
