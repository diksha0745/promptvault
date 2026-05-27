# PromptVault Pro

PromptVault Pro is an enterprise-grade prompt engineering workspace built as a strict monorepo with a FastAPI backend and a Vite React frontend.

## Stack

- Backend: FastAPI, SQLAlchemy, SQLite, Pydantic
- Frontend: React, Vite, Tailwind CSS, lucide-react
- Database: `sqlite:///./promptvault.db`

## Project Layout

```text
PromptVaultPro/
  backend/
    database.py
    main.py
    models.py
    requirements.txt
  frontend/
    src/
      App.jsx
      index.css
      main.jsx
    index.html
    package.json
    postcss.config.js
    tailwind.config.js
```

## Backend Setup

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

The API runs at `http://localhost:8000`. Tables are created automatically on startup.

## Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The app runs at the Vite URL shown in your terminal, usually `http://localhost:5173`.

To point the frontend at another API host:

```bash
VITE_API_URL=http://localhost:8000 npm run dev
```

## API

- `GET /prompts`: list prompts with optional `search` and `tool_tag` filters
- `POST /prompts`: create a prompt
- `PUT /prompts/{id}/copy`: increment `times_copied`
- `DELETE /prompts/{id}`: delete a prompt
- `GET /health`: health check

## Core Features

- Dynamic `{{variable}}` extraction with live input generation
- Real-time compiled prompt preview
- Async copy analytics tracking
- Global search and tool-tag filtering
- Dark technical SaaS dashboard UI

## Production Notes

- Replace the permissive CORS policy before deploying to a public environment.
- Put the SQLite file on persistent storage, or swap SQLAlchemy to a managed database URL.
- Build the frontend with `npm run build` and serve `frontend/dist` from your preferred static host.
