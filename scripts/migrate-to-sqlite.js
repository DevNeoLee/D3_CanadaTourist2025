/**
 * CSV to SQLite Migration Script
 * Converts travel_province_data.csv to SQLite database
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CSV_PATH = path.join(__dirname, '../public/data/travel_province_data.csv');
const DB_PATH = path.join(__dirname, '../data/tourists.db');

// Provinces to filter
const PROVINCES = [
  "Newfoundland and Labrador",
  "Prince Edward Island",
  "Nova Scotia",
  "New Brunswick",
  "Quebec",
  "Ontario",
  "Manitoba",
  "Saskatchewan",
  "Alberta",
  "British Columbia",
  "Yukon",
  "Nunavut"
];

/**
 * Filter relevant data (same logic as DataProcessor.filterRelevantData)
 */
function filterRelevantData(row) {
  return (
    PROVINCES.includes(row.GEO) &&
    row['Traveller characteristics'] === "Total non resident tourists" &&
    row['Seasonal adjustment'] === "Unadjusted" &&
    row.REF_DATE[0] === '2'
  );
}

/**
 * Extract year from REF_DATE (e.g., "2010-07" -> 10)
 */
function extractYear(dateString) {
  return parseInt(dateString.slice(2, 4));
}

/**
 * Extract month from REF_DATE (e.g., "2010-07" -> 7)
 */
function extractMonth(dateString) {
  return parseInt(dateString.slice(5, 7));
}

/**
 * Main migration function
 */
function migrate() {
  console.log('Starting migration...');
  
  // Read CSV file
  console.log(`Reading CSV from: ${CSV_PATH}`);
  const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
  
  // Parse CSV
  console.log('Parsing CSV...');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    bom: true  // Handle UTF-8 BOM
  });
  
  console.log(`Total records: ${records.length}`);
  
  // Filter relevant data
  console.log('Filtering relevant data...');
  const filtered = records.filter(filterRelevantData);
  console.log(`Filtered records: ${filtered.length}`);
  
  // Create database directory if it doesn't exist
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  // Remove existing database
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }
  
  // Create SQLite database
  console.log(`Creating database: ${DB_PATH}`);
  const db = new Database(DB_PATH);
  
  // Create table
  db.exec(`
    CREATE TABLE tourists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref_date TEXT NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      geo TEXT NOT NULL,
      value INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX idx_year_month ON tourists(year, month);
    CREATE INDEX idx_geo ON tourists(geo);
    CREATE INDEX idx_year_month_geo ON tourists(year, month, geo);
  `);
  
  // Prepare insert statement
  const insert = db.prepare(`
    INSERT INTO tourists (ref_date, year, month, geo, value)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      const year = extractYear(row.REF_DATE);
      const month = extractMonth(row.REF_DATE);
      const value = parseInt(row.VALUE) || 0;
      
      insert.run(
        row.REF_DATE,
        year,
        month,
        row.GEO,
        value
      );
    }
  });
  
  // Insert data in batches
  console.log('Inserting data...');
  const BATCH_SIZE = 1000;
  for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
    const batch = filtered.slice(i, i + BATCH_SIZE);
    insertMany(batch);
    
    if ((i + BATCH_SIZE) % 10000 === 0 || i + BATCH_SIZE >= filtered.length) {
      console.log(`Inserted ${Math.min(i + BATCH_SIZE, filtered.length)} / ${filtered.length} records`);
    }
  }
  
  // Verify data
  const count = db.prepare('SELECT COUNT(*) as count FROM tourists').get();
  console.log(`\nMigration complete!`);
  console.log(`Total records in database: ${count.count}`);
  
  // Show sample data
  const sample = db.prepare(`
    SELECT * FROM tourists 
    WHERE year = 10 AND month = 7 
    ORDER BY value DESC 
    LIMIT 5
  `).all();
  
  console.log('\nSample data (2010-07):');
  console.table(sample);
  
  db.close();
  console.log('\nDatabase created successfully!');
}

// Run migration
try {
  migrate();
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}
