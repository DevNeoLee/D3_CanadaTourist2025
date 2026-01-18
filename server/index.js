/**
 * Express API Server for Canada Tourist Data
 * Provides REST API endpoints to query SQLite database
 */

import express from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors()); // Enable CORS for frontend
app.use(express.json());

// Connect to SQLite database
const DB_PATH = path.join(__dirname, '../data/tourists.db');
const db = new Database(DB_PATH);

/**
 * GET /api/tourists
 * Query parameters: year, month
 * Returns: Array of tourist data for specified year and month
 */
app.get('/api/tourists', (req, res) => {
  try {
    const year = parseInt(req.query.year);
    const month = parseInt(req.query.month);

    // Validate input
    if (isNaN(year) || isNaN(month)) {
      return res.status(400).json({ 
        error: 'Year and month are required' 
      });
    }

    if (year < 0 || year > 19 || month < 1 || month > 12) {
      return res.status(400).json({ 
        error: 'Invalid year (0-19) or month (1-12)' 
      });
    }

    // Query database
    const query = db.prepare(`
      SELECT ref_date, year, month, geo, value
      FROM tourists
      WHERE year = ? AND month = ?
      ORDER BY value DESC
    `);

    const data = query.all(year, month);

    // Calculate total
    const total = data.reduce((sum, item) => sum + item.value, 0);

    res.json({
      year: 2000 + year,
      month: month,
      provinces: data,
      total: total
    });

  } catch (error) {
    console.error('Error querying database:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/tourists/stats
 * Query parameters: year (optional)
 * Returns: Statistics for the year
 */
app.get('/api/tourists/stats', (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year) : null;

    if (year !== null && (isNaN(year) || year < 0 || year > 19)) {
      return res.status(400).json({ 
        error: 'Invalid year (0-19)' 
      });
    }

    let query, params;
    if (year !== null) {
      query = db.prepare(`
        SELECT month, SUM(value) as total
        FROM tourists
        WHERE year = ?
        GROUP BY month
        ORDER BY month
      `);
      params = [year];
    } else {
      query = db.prepare(`
        SELECT year, SUM(value) as total
        FROM tourists
        GROUP BY year
        ORDER BY year
      `);
      params = [];
    }

    const data = query.all(...params);
    res.json(data);

  } catch (error) {
    console.error('Error querying stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', database: 'connected' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Database: ${DB_PATH}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close();
  console.log('\n👋 Server closed');
  process.exit(0);
});
