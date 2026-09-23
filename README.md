# DevPilot

DevPilot is a workspace for individual developers to organize projects and track bugs, features, and tasks. V1 covers accounts, projects, issues, labels, comments, a Kanban board, and a basic dashboard. GitHub integration and AI are later phases.

## First coding milestone

This repository begins with a small vertical slice: a FastAPI health endpoint and a Next.js page that fetches it. It proves the two applications can communicate before authentication or database work begins. No account or issue data exists yet.

## Open in VS Code

Open the `devpilot` folder using **File → Open Folder**. Run the backend and frontend in separate VS Code terminals.

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate             # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Visit http://localhost:8000/docs and http://localhost:8000/api/health.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local           # Windows PowerShell: Copy-Item .env.example .env.local
npm run dev
```

Visit http://localhost:3000. The page should say **API connected** while the backend is running. Both apps run locally. PostgreSQL will be added with the first persistence milestone.

## Documentation

- [Product requirements](docs/prd.md)
- [Architecture and decisions](docs/architecture.md)
- [Database design](docs/database.md)
- [API contract](docs/api.md)
- [UI wireframes](docs/wireframes.md)
- [Implementation plan](docs/roadmap.md)

## Next step

Review the health endpoint and the frontend request path, then implement database setup and the first migration. See `docs/roadmap.md` for the order and acceptance checks.
