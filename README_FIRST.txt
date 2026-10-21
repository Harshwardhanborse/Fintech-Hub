FINTECH HUB — AUTH + STOCK EDUCATION DEMO

Included:
- React + Vite frontend
- Node.js + Express API
- Signup/login with bcrypt password hashing and JWT
- Budget, transactions, investment tracking and rule-based insights
- Educational stock/ETF watchlist examples and links to broker websites
- Broker buttons are external links only; there is NO real broker API integration or order placement.

Run backend:
  cd backend
  npm install
  copy .env.example .env
  npm run dev

Run frontend in a second terminal:
  cd frontend
  npm install
  npm run dev

Open Vite URL (usually http://localhost:5173).

Important:
- Default data is in memory; it resets when backend restarts. Configure MongoDB in backend/.env for persistence.
- Set a strong JWT_SECRET in backend/.env before any real deployment.
- This is an educational student prototype, not a production financial app.
- Stock examples are not buy recommendations and have no live prices. Do your own research and consider risk tolerance.
- Broker integrations require official developer apps, API keys, OAuth/consent flows and provider-specific implementation. Never collect broker passwords or OTPs in this app.
