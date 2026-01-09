# Redi Cin7 ↔ Stripe Integration Service

A Node.js + TypeScript service to generate Stripe payment links for new Cin7 sales and to post completed payments back to Cin7 using the SalePayments (POST) endpoint.

Quick start
- Copy .env.example to .env and set values
- Install dependencies: npm install
- Run in dev mode: npm run dev
- Health check: GET http://localhost:3000/health

Scripts
- dev — Run with auto-reload (ts-node-dev)
- build — Compile TypeScript to dist/
- start — Run compiled app
- format — Apply Prettier

Next steps
- Add Cin7 and Stripe API clients
- Implement sale discovery worker and webhook handler
- Post completed payments to Cin7 (SalePayments)