const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');

const isProduction = process.env.DATABASE_URL ? true : false;
let dbInstance = null;

// Database Connection Factory
function getDb() {
  if (dbInstance) return dbInstance;

  if (isProduction) {
    console.log('Connecting to PostgreSQL database...');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,                       // Her serverless instance en fazla 10 bağlantı açabilir (PgBouncer 200 limitini korur)
      idleTimeoutMillis: 10000,      // Boşta kalan bağlantılar 10 saniyede kapatılır
      connectionTimeoutMillis: 5000, // Bağlantı 5 saniyede açılamazsa hata fırlatılır (kuyrukta sonsuz beklenmez)
    });
    dbInstance = {
      type: 'postgres',
      connection: pool,
      query: (text, params) => pool.query(text, params),
    };
  } else {
    console.log('Connecting to local SQLite database (election.db)...');
    const sqliteDb = new sqlite3.Database('./election.db', (err) => {
      if (err) console.error('SQLite connection error:', err.message);
    });
    
    dbInstance = {
      type: 'sqlite',
      connection: sqliteDb,
      query: (text, params = []) => {
        const sqliteText = text.replace(/\$\d+/g, '?');
        return new Promise((resolve, reject) => {
          sqliteDb.all(sqliteText, params, (err, rows) => {
            if (err) return reject(err);
            resolve({ rows });
          });
        });
      },
      run: (text, params = []) => {
        const sqliteText = text.replace(/\$\d+/g, '?');
        return new Promise((resolve, reject) => {
          sqliteDb.run(sqliteText, params, function(err) {
            if (err) return reject(err);
            resolve({ lastID: this.lastID, changes: this.changes });
          });
        });
      }
    };
  }
  return dbInstance;
}

// Initialise Database Tables and Seed Data
async function initDb() {
  const db = getDb();
  
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS votes (
      id SERIAL PRIMARY KEY,
      ip VARCHAR(100) UNIQUE NOT NULL,
      candidate VARCHAR(50) NOT NULL,
      city_code VARCHAR(10) NOT NULL,
      voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const sqliteCreateTableQuery = `
    CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT UNIQUE NOT NULL,
      candidate TEXT NOT NULL,
      city_code TEXT NOT NULL,
      voted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    if (db.type === 'postgres') {
      await db.query(createTableQuery);
      console.log('PostgreSQL votes table checked/created.');
    } else {
      await db.run(sqliteCreateTableQuery);
      console.log('SQLite votes table checked/created.');
    }
    
    // Seed database if empty (only in local development, never automatically in production)
    const shouldSeed = !isProduction || process.env.SEED_DATABASE === 'true';
    if (shouldSeed) {
      await seedDataIfEmpty();
    }
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// Checks if database has any votes, if empty, seeds realistic domestic and abroad votes.
async function seedDataIfEmpty() {
  const db = getDb();
  try {
    const checkQuery = 'SELECT COUNT(*) as count FROM votes';
    const result = await db.query(checkQuery);
    
    const count = parseInt(result.rows[0].count || result.rows[0].COUNT || 0, 10);
    
    if (count > 0) {
      console.log(`Database already has ${count} records. Seeding skipped.`);
      return;
    }

    console.log('Database is empty. Seeding realistic votes for Turkey provinces and Abroad countries...');
    
    const seedVotes = [];
    
    // 1. Generate domestic votes (provinces 01-81)
    for (let i = 1; i <= 81; i++) {
      const cityCode = i.toString().padStart(2, '0');
      const voteCount = Math.floor(Math.random() * 150) + 100;
      
      let halkProb = 0.5;

      if (['35', '48', '09', '22', '39', '59', '17', '10'].includes(cityCode)) {
        halkProb = 0.38; 
      } else if (['42', '38', '66', '58', '70', '51', '25', '23', '05'].includes(cityCode)) {
        halkProb = 0.65;
      } else if (['34', '06', '07', '16', '33', '01'].includes(cityCode)) {
        halkProb = 0.48 + (Math.random() * 0.04);
      } else {
        halkProb = 0.42 + (Math.random() * 0.16);
      }

      for (let v = 0; v < voteCount; v++) {
        const isHalk = Math.random() < halkProb;
        const candidate = isHalk ? 'halk' : 'kngl';
        const ip = `seed_${cityCode}_${v}`;
        seedVotes.push({ ip, candidate, cityCode });
      }
    }

    // 2. Generate abroad votes (countries DE, FR, NL, GB, US, OT)
    const abroadCountries = [
      { code: 'DE', name: 'Almanya', votes: 450, halkProb: 0.45 },
      { code: 'FR', name: 'Fransa', votes: 320, halkProb: 0.53 },
      { code: 'NL', name: 'Hollanda', votes: 280, halkProb: 0.58 },
      { code: 'GB', name: 'İngiltere', votes: 190, halkProb: 0.39 },
      { code: 'US', name: 'ABD', votes: 240, halkProb: 0.37 },
      { code: 'OT', name: 'Diğer Ülkeler', votes: 380, halkProb: 0.49 }
    ];

    abroadCountries.forEach(country => {
      for (let v = 0; v < country.votes; v++) {
        const isHalk = Math.random() < country.halkProb;
        const candidate = isHalk ? 'halk' : 'kngl';
        const ip = `seed_abroad_${country.code}_${v}`;
        seedVotes.push({ ip, candidate, cityCode: country.code });
      }
    });

    // Insert seeds efficiently
    if (db.type === 'postgres') {
      console.log(`Inserting ${seedVotes.length} seed votes into PostgreSQL...`);
      const chunkSize = 500;
      for (let i = 0; i < seedVotes.length; i += chunkSize) {
        const chunk = seedVotes.slice(i, i + chunkSize);
        const valueStrings = chunk.map((_, idx) => `($${idx * 3 + 1}, $${idx * 3 + 2}, $${idx * 3 + 3})`).join(', ');
        const queryText = `INSERT INTO votes (ip, candidate, city_code) VALUES ${valueStrings}`;
        const queryParams = chunk.flatMap(v => [v.ip, v.candidate, v.cityCode]);
        await db.query(queryText, queryParams);
      }
    } else {
      console.log(`Inserting ${seedVotes.length} seed votes into SQLite...`);
      await db.run('BEGIN TRANSACTION');
      const insertStmt = 'INSERT INTO votes (ip, candidate, city_code) VALUES (?, ?, ?)';
      for (const vote of seedVotes) {
        await db.run(insertStmt, [vote.ip, vote.candidate, vote.cityCode]);
      }
      await db.run('COMMIT');
    }
    
    console.log('SUCCESS: Finished seeding database.');
  } catch (error) {
    console.error('Seeding error:', error);
  }
}

// In-memory cache for voted IPs to avoid redundant database queries under flood attacks
const votedIpCache = new Set();

// Check if IP has already voted (checks in-memory cache FIRST, then database)
async function hasVoted(ip) {
  // 1. If IP is in the in-memory cache, return true instantly (0 database cost!)
  if (votedIpCache.has(ip)) {
    return true;
  }

  // 2. Otherwise, check the database
  const db = getDb();
  const queryText = 'SELECT id FROM votes WHERE ip = $1 LIMIT 1';
  try {
    const result = await db.query(queryText, [ip]);
    const voted = result.rows.length > 0;
    if (voted) {
      votedIpCache.add(ip); // Cache it so we never query for this IP again!
    }
    return voted;
  } catch (error) {
    console.error('Error checking vote status:', error);
    return false;
  }
}

// Add a new vote
async function castVote(ip, candidate, cityCode) {
  const db = getDb();
  const queryText = 'INSERT INTO votes (ip, candidate, city_code) VALUES ($1, $2, $3)';
  try {
    if (db.type === 'postgres') {
      await db.query(queryText, [ip, candidate, cityCode]);
    } else {
      await db.run(queryText, [ip, candidate, cityCode]);
    }
    votedIpCache.add(ip); // Cache immediately after successful vote
    return true;
  } catch (error) {
    if (error.message && (error.message.includes('UNIQUE') || error.message.includes('duplicate key'))) {
      console.warn(`Double vote attempt blocked for IP: ${ip}`);
      votedIpCache.add(ip); // Also cache on duplicate key (they already voted)
      return false;
    }
    console.error('Error casting vote:', error);
    throw error;
  }
}

// Delete vote for specific IP
async function resetVote(ip) {
  const db = getDb();
  const queryText = 'DELETE FROM votes WHERE ip = $1';
  try {
    if (db.type === 'postgres') {
      await db.query(queryText, [ip]);
    } else {
      await db.run(queryText, [ip]);
    }
    votedIpCache.delete(ip); // Clear from in-memory cache too
    return true;
  } catch (error) {
    console.error('Error resetting vote:', error);
    return false;
  }
}

// Fetch aggregate statistics (General, domestic cities, abroad countries)
async function getElectionResults() {
  const db = getDb();
  try {
    // 1. Get totals grouped by candidate
    const totalsQuery = 'SELECT candidate, COUNT(*) as count FROM votes GROUP BY candidate';
    const totalsRes = await db.query(totalsQuery);
    
    let totalVotes = 0;
    let halkVotes = 0;
    let knglVotes = 0;

    totalsRes.rows.forEach(row => {
      const cnt = parseInt(row.count || row.COUNT || 0, 10);
      totalVotes += cnt;
      if (row.candidate === 'halk') {
        halkVotes = cnt;
      } else if (row.candidate === 'kngl') {
        knglVotes = cnt;
      }
    });

    // 2. Get votes per city/country grouped by city_code and candidate
    const cityQuery = 'SELECT city_code, candidate, COUNT(*) as count FROM votes GROUP BY city_code, candidate';
    const cityRes = await db.query(cityQuery);

    // Initialise maps
    const cityMap = {};
    for (let i = 1; i <= 81; i++) {
      const code = i.toString().padStart(2, '0');
      cityMap[code] = { city_code: code, halk: 0, kngl: 0, total: 0 };
    }

    const abroadMap = {
      'DE': { code: 'DE', name: 'Almanya', halk: 0, kngl: 0, total: 0 },
      'FR': { code: 'FR', name: 'Fransa', halk: 0, kngl: 0, total: 0 },
      'NL': { code: 'NL', name: 'Hollanda', halk: 0, kngl: 0, total: 0 },
      'GB': { code: 'GB', name: 'İngiltere', halk: 0, kngl: 0, total: 0 },
      'US': { code: 'US', name: 'ABD', halk: 0, kngl: 0, total: 0 },
      'OT': { code: 'OT', name: 'Diğer Ülkeler', halk: 0, kngl: 0, total: 0 }
    };

    // Populate with actual values
    cityRes.rows.forEach(row => {
      const code = row.city_code;
      const count = parseInt(row.count || row.COUNT || 0, 10);
      
      // Categorize into domestic provinces or abroad countries
      if (cityMap[code]) {
        cityMap[code][row.candidate] = count;
        cityMap[code].total += count;
      } else if (abroadMap[code]) {
        abroadMap[code][row.candidate] = count;
        abroadMap[code].total += count;
      } else {
        // Fallback for random codes that don't match, map to 'OT'
        if (abroadMap['OT']) {
          abroadMap['OT'][row.candidate] += count;
          abroadMap['OT'].total += count;
        }
      }
    });

    // Format list of domestic cities results
    const citiesList = Object.values(cityMap).map(city => {
      const total = city.total;
      let halkPercent = 0;
      let knglPercent = 0;
      let winner = 'tie';

      if (total > 0) {
        halkPercent = parseFloat(((city.halk / total) * 100).toFixed(1));
        knglPercent = parseFloat(((city.kngl / total) * 100).toFixed(1));
        if (city.halk > city.kngl) winner = 'halk';
        else if (city.kngl > city.halk) winner = 'kngl';
      }

      return {
        city_code: city.city_code,
        halk_count: city.halk,
        kngl_count: city.kngl,
        halk_percentage: halkPercent,
        kngl_percentage: knglPercent,
        total_votes: total,
        winner
      };
    });

    // Format list of abroad countries results
    const abroadList = Object.values(abroadMap).map(country => {
      const total = country.total;
      let halkPercent = 0;
      let knglPercent = 0;
      let winner = 'tie';

      if (total > 0) {
        halkPercent = parseFloat(((country.halk / total) * 100).toFixed(1));
        knglPercent = parseFloat(((country.kngl / total) * 100).toFixed(1));
        if (country.halk > country.kngl) winner = 'halk';
        else if (country.kngl > country.halk) winner = 'kngl';
      }

      return {
        country_code: country.code,
        country_name: country.name,
        halk_count: country.halk,
        kngl_count: country.kngl,
        halk_percentage: halkPercent,
        kngl_percentage: knglPercent,
        total_votes: total,
        winner
      };
    });

    return {
      total_votes: totalVotes,
      halk_votes: halkVotes,
      kngl_votes: knglVotes,
      halk_percentage: totalVotes > 0 ? parseFloat(((halkVotes / totalVotes) * 100).toFixed(2)) : 0,
      kngl_percentage: totalVotes > 0 ? parseFloat(((knglVotes / totalVotes) * 100).toFixed(2)) : 0,
      cities: citiesList,
      abroad: abroadList
    };

  } catch (error) {
    console.error('Error fetching election results:', error);
    throw error;
  }
}

module.exports = {
  initDb,
  hasVoted,
  castVote,
  resetVote,
  getElectionResults
};
