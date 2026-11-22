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

### Use SEA-LION with the free Blueprint

The Blueprint configures the direct [SEA-LION endpoint](https://docs.sea-lion.ai/guides/inferencing/api) and the `aisingapore/Qwen-SEA-LION-v4.5-27B-IT` model. Enter your SEA-LION trial key in the web service's **Environment** settings as `FREELLMAPI_API_KEY`. For an existing deployment configured manually, set `FREELLMAPI_BASE_URL=https://api.sea-lion.ai/v1` and `FREELLMAPI_MODEL=aisingapore/Qwen-SEA-LION-v4.5-27B-IT` there too. Render keeps the key server-side.

In **Ask AI**, a model reply shows **Live AI**. The app's built-in directions show **App guide** and link to the relevant screen. Record-based answers shown as **Local fallback** are available when the AI endpoint is unavailable. Run `python smoke_agents.py https://YOUR-SERVICE.onrender.com` for read-only checks of all four live agents and their app guidance.

## Connect Ask AI to FreeLLMAPI

The unified API key on the FreeLLMAPI dashboard belongs to that gateway instance. If your dashboard is already hosted at a reachable HTTPS address, use that gateway's URL ending in `/v1` as `FREELLMAPI_BASE_URL` and its unified key as `FREELLMAPI_API_KEY` in your SARI-AI web service's **Environment** settings. A gateway running on your PC can serve a local SARI-AI backend. For local Windows testing, use the same PowerShell session that starts `python main.py` and use the port shown by your gateway.

```powershell
$env:FREELLMAPI_BASE_URL = 'http://127.0.0.1:3001/v1'
$env:FREELLMAPI_API_KEY = '<unified key from your FreeLLMAPI gateway>'
$env:FREELLMAPI_MODEL = 'auto'
```

### Run a new FreeLLMAPI gateway on Render

1. In Render, choose **New → Private Service → Existing Image** and enter `ghcr.io/tashfeenahmed/freellmapi:latest`. Use the same **workspace and region** as the SARI-AI web service. The private service and its persistent disk are paid. Attach the disk at `/app/server/data` to preserve the gateway's settings and keys across restarts. [Render private services](https://render.com/docs/private-services) · [Render persistent disks](https://render.com/docs/disks)
2. On the gateway service, set `HOST=0.0.0.0`, `PORT=3001`, `FREEAPI_DB_PATH=/app/server/data/freeapi.db`, and `ENCRYPTION_KEY` to a new random 64-character hex value. Generate it locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and retain the same value across deployments. [FreeLLMAPI Docker setup](https://github.com/tashfeenahmed/freellmapi/blob/main/docs/en/install/01-install.md#docker-image--operations)
3. Put one upstream provider credential in the gateway's `FREEAPI_CONFIG_JSON` environment variable. This example uses Groq. Substitute your provider's platform identifier and its API key. The unified client key from another gateway does not configure a provider. Use a strong, unique dashboard password in the JSON. [FreeLLMAPI startup config](https://github.com/tashfeenahmed/freellmapi/blob/main/docs/en/install/01-install.md#declarative-startup-config)

   ```json
   {"admin":{"email":"your-email@example.com","password":"replace-with-a-strong-password"},"keys":[{"platform":"groq","key":"replace-with-the-provider-key"}]}
   ```

4. Deploy the gateway. On its **Connect → Internal** tab, copy the address, for example `freellmapi-ab12:3001`. On the gateway's **Shell** tab, run the following read-only command to retrieve this instance's unified client key. Copy its output directly to the SARI-AI backend's environment settings. [Render Shell access](https://render.com/docs/ssh)

   ```sh
   node -e 'const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync(process.env.FREEAPI_DB_PATH, { readOnly: true }); console.log(db.prepare("SELECT value FROM settings WHERE key = ?").get("unified_api_key").value)'
   ```

5. In the SARI-AI web service, set `FREELLMAPI_RENDER_INTERNAL_ADDRESS` to the copied `hostname:port` and `FREELLMAPI_API_KEY` to the new unified key. Leave `FREELLMAPI_BASE_URL` unset for this setup. Set `FREELLMAPI_MODEL=auto` to use the gateway's fallback chain, or use the ID of a model your provider supports. Deploy the SARI-AI revision with private-network support. [Render private networking](https://render.com/docs/private-network)

Open **Ask AI** and ask “Which product sold most?” A live answer displays **Live AI** next to the agent name. If you see **Local fallback**, check that the gateway is running, the key came from that instance, and the selected model is available. Keep both credentials in their respective service's Environment settings.

The backend sends the submitted question and either the relevant store aggregates or a compact product catalogue. Analytics requests exclude customer names, raw transactions, and notebook notes from the attached store context. Use fictional data for the demo, including in the questions. FreeLLMAPI's maintainers describe it as a gateway for personal experimentation. Check the enabled provider's terms before sharing access to a hosted demo.

Use the language menu to switch between English and Filipino. Product names, units, and catalog categories stay as entered.

Recording is available on Sales, Stock, Expenses, and Ledger. Users can type, use the browser's speech recognition where supported, or read a receipt or product label on Stock. Photo lookup reads package text and suggests matching catalog names. Receipt OCR runs in the browser and produces a draft for review. Confirm the quantity, unit, and price against the original receipt before saving.

Home, Sales, and Expenses show charts and summaries computed from records. Stock includes the planner for reorder timing, quantities, and price or new-product scenarios. Home flags inventory and cash issues with links to the affected records. Ask Suki handles general questions without an agent selector. Saving a draft displays the amount and stock or credit changes, with a link to the record.

## Demo flow

1. Open **Home** for today’s sales, the change since yesterday, expenses, and the seven-day sales trend.
2. Type **Dagdag 24 na kape.** into Notebook entry, then review Suki’s proposed change before saving. For bulk entry, open **Stock → Enter multiple notebook rows** and paste rows in the format `Product name, quantity, optional note`. Choose physical count, stock-in, or wastage. Review the draft before saving. Stock history shows the date, source note, change, and quantity after each entry.
3. Record a checkout and see sales and available stock update. Cash and credit sales share one checkout. Repayments appear in cash received.
4. In **Ask AI**, try "Which product sold most?", "What needs restocking?", "Check my records", or "Restock 20 Coffee sachets." Open **View store figures** on an analysis response to see the calculations behind it.

Stock cover uses the last seven complete days of sales and requires sales on at least three distinct days. Record checks flag products with zero unit costs and count corrections of at least ten units. Online access is required to save records.
