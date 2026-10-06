'use strict';

/**
 * Take-home assessment API.
 *
 * A small Express server that serves seeded JSON for an alternative-investments
 * portfolio. Reads support filtering, sorting, and pagination; writes are
 * validated and applied to in-memory state (they persist until the server
 * restarts). No database, no auth — everything you need is in this file and the
 * JSON under ./src/data.
 */

const path = require('path');
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');

const openapi = require('./docs/openapi.json');
const funds = require('./src/data/funds.json');
const seedCommitments = require('./src/data/commitments.json');

const PORT = process.env.PORT || 4000;
// Simulated network latency (ms) so loading/pending states are exercisable.
const LATENCY_MS = Number.isFinite(Number(process.env.LATENCY_MS))
  ? Number(process.env.LATENCY_MS)
  : 350;

// Mutable working copies — POSTs mutate these, not the JSON on disk.
const commitments = seedCommitments.map((c) => ({ ...c }));

const app = express();
app.use(cors());
app.use(express.json());

// Interactive API reference. This is the interface candidates build against —
// served outside /api so it isn't subject to the artificial latency below.
// Opening the server root redirects here.
app.get('/', (_req, res) => res.redirect('/docs'));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi, {
  customSiteTitle: 'Meridian Portfolio API',
}));

// Artificial latency for every /api request.
app.use('/api', (req, res, next) => {
  if (LATENCY_MS > 0) return setTimeout(next, LATENCY_MS);
  next();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Apply ?sort=field & ?order=asc|desc to a copy of `rows`. */
function sortRows(rows, sort, order) {
  if (!sort) return rows;
  const dir = order === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = a[sort];
    const bv = b[sort];
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}

/** Apply ?page & ?pageSize and wrap in { data, meta }. */
function paginate(rows, query) {
  const total = rows.length;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize, 10) || 25));
  const start = (page - 1) * pageSize;
  return {
    data: rows.slice(start, start + pageSize),
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 },
  };
}

function badRequest(res, message, fields) {
  return res.status(400).json({ error: message, fields: fields || {} });
}

function notFound(res, message) {
  return res.status(404).json({ error: message || 'Not found' });
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Aggregate portfolio KPIs across all commitments.
app.get('/api/portfolio/summary', (_req, res) => {
  const totals = commitments.reduce(
    (acc, c) => {
      acc.committed += c.committed;
      acc.called += c.called;
      acc.distributed += c.distributed;
      acc.nav += c.nav;
      return acc;
    },
    { committed: 0, called: 0, distributed: 0, nav: 0 }
  );

  const unfunded = totals.committed - totals.called;
  const totalValue = totals.nav + totals.distributed;
  const netMoic = totals.called ? totalValue / totals.called : 0;
  const netDpi = totals.called ? totals.distributed / totals.called : 0;

  res.json({
    totalCommitted: totals.committed,
    totalCalled: totals.called,
    totalDistributed: totals.distributed,
    totalNav: totals.nav,
    unfundedCommitment: unfunded,
    netMoic: Number(netMoic.toFixed(2)),
    netDpi: Number(netDpi.toFixed(2)),
    activeCommitments: commitments.filter((c) => c.status === 'active').length,
    currency: 'USD',
  });
});

// Funds open for commitment. Filters: ?strategy ?stage ?region ?q. Sort + paginate.
app.get('/api/funds', (req, res) => {
  const { strategy, stage, region, q } = req.query;
  let rows = funds;

  if (strategy) rows = rows.filter((f) => f.strategy === strategy);
  if (stage) rows = rows.filter((f) => f.stage === stage);
  if (region) rows = rows.filter((f) => f.region === region);
  if (q) {
    const needle = String(q).toLowerCase();
    rows = rows.filter(
      (f) =>
        f.name.toLowerCase().includes(needle) ||
        f.manager.toLowerCase().includes(needle)
    );
  }

  rows = sortRows(rows, req.query.sort, req.query.order);
  res.json(paginate(rows, req.query));
});

// Commitments (the investor's investments). Filters: ?status ?fundId.
app.get('/api/commitments', (req, res) => {
  const { status, fundId } = req.query;
  let rows = commitments;

  if (status) rows = rows.filter((c) => c.status === status);
  if (fundId) rows = rows.filter((c) => c.fundId === fundId);

  rows = sortRows(rows, req.query.sort, req.query.order);
  res.json(paginate(rows, req.query));
});

app.get('/api/commitments/:id', (req, res) => {
  const commitment = commitments.find((c) => c.id === req.params.id);
  if (!commitment) return notFound(res, `No commitment with id "${req.params.id}"`);
  res.json(commitment);
});

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Commit capital to a fund. Powers the "Commit" modal + form.
 * Body: { amount, acknowledgedTerms }
 */
app.post('/api/funds/:id/commitments', (req, res) => {
  const fund = funds.find((f) => f.id === req.params.id);
  if (!fund) return notFound(res, `No fund with id "${req.params.id}"`);
  if (fund.stage === 'closed') {
    return res.status(409).json({ error: `${fund.name} is closed to new commitments.` });
  }

  const { amount, acknowledgedTerms } = req.body || {};
  const fields = {};

  const numericAmount = Number(amount);
  if (amount === undefined || amount === null || amount === '') {
    fields.amount = 'Enter a commitment amount.';
  } else if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    fields.amount = 'Amount must be a positive number.';
  } else if (numericAmount < fund.minInvestment) {
    fields.amount = `Minimum commitment for this fund is $${fund.minInvestment.toLocaleString()}.`;
  }

  if (acknowledgedTerms !== true) {
    fields.acknowledgedTerms = 'You must acknowledge the fund terms to continue.';
  }

  if (Object.keys(fields).length > 0) {
    return badRequest(res, 'Please correct the highlighted fields.', fields);
  }

  const commitment = {
    id: `cm_${String(commitments.length + 1).padStart(4, '0')}`,
    fundId: fund.id,
    fundName: fund.name,
    manager: fund.manager,
    strategy: fund.strategy,
    committed: numericAmount,
    called: 0,
    distributed: 0,
    nav: 0,
    dateCommitted: new Date().toISOString().slice(0, 10),
    status: 'pending_close',
    netIrrPct: 0,
    netMoic: 0,
    netDpi: 0,
  };

  commitments.push(commitment);
  res.status(201).json(commitment);
});

// ---------------------------------------------------------------------------
// Fallbacks
// ---------------------------------------------------------------------------

app.use('/api', (_req, res) => notFound(res, 'Unknown API route.'));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err && err.type === 'entity.parse.failed') {
    return badRequest(res, 'Request body is not valid JSON.');
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`\n  Assessment API running at http://localhost:${PORT}`);
  console.log(`  API reference:    http://localhost:${PORT}/docs`);
  console.log(`  Simulated latency: ${LATENCY_MS}ms per request`);
  console.log(`  Health check:     http://localhost:${PORT}/api/health\n`);
});

module.exports = app;
