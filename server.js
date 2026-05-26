const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Helper to reliably get client IP (handles Vercel, Render proxies)
function getClientIp(req) {
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    const parts = xForwardedFor.split(',');
    return parts[0].trim();
  }
  const xRealIp = req.headers['x-real-ip'];
  if (xRealIp) return xRealIp;
  return req.ip || req.connection.remoteAddress || '127.0.0.1';
}

// In-memory store for failed password attempts to prevent brute force
const failedAttemptsStore = new Map(); // ip -> { count, lockUntil }

function checkBruteForce(ip) {
  const now = Date.now();
  const record = failedAttemptsStore.get(ip);
  if (record && record.lockUntil && record.lockUntil > now) {
    const remainingMin = Math.ceil((record.lockUntil - now) / 60000);
    return { blocked: true, remainingMin };
  }
  return { blocked: false };
}

function recordFailedAttempt(ip) {
  const now = Date.now();
  let record = failedAttemptsStore.get(ip);
  if (!record || (record.lockUntil && record.lockUntil < now)) {
    record = { count: 0, lockUntil: 0 };
  }
  record.count += 1;
  if (record.count >= 5) {
    record.lockUntil = now + 15 * 60 * 1000; // Lock for 15 minutes
  }
  failedAttemptsStore.set(ip, record);
  return record;
}

function clearFailedAttempts(ip) {
  failedAttemptsStore.delete(ip);
}

// In-memory store for voting request tracking to prevent automated flooding/DDoS
const voteFloodStore = new Map(); // ip -> { count, windowStart, blockUntil }

function checkVoteFlood(ip) {
  const now = Date.now();
  const record = voteFloodStore.get(ip);
  if (record && record.blockUntil && record.blockUntil > now) {
    const remainingMin = Math.ceil((record.blockUntil - now) / 60000);
    return { blocked: true, remainingMin };
  }
  return { blocked: false };
}

function trackVoteRequest(ip) {
  const now = Date.now();
  let record = voteFloodStore.get(ip);
  
  if (!record || (now - record.windowStart > 60 * 1000)) {
    record = { count: 0, windowStart: now, blockUntil: 0 };
  }
  
  record.count += 1;
  
  // If an IP makes more than 5 requests to /api/vote within 1 minute, block it for 10 minutes!
  if (record.count > 5) {
    record.blockUntil = now + 10 * 60 * 1000;
  }
  
  voteFloodStore.set(ip, record);
  return record;
}

// 1. GET /api/status - Check if client IP has voted
app.get('/api/status', async (req, res) => {
  try {
    const ip = getClientIp(req);
    const voted = await db.hasVoted(ip);
    
    // Also send back IP for frontend debugging
    res.json({
      voted,
      ip: ip.includes('::ffff:') ? ip.replace('::ffff:', '') : ip
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Durum kontrolü sırasında hata oluştu.' });
  }
});

// Helper to automatically geolocate the client's city/country code (01-81 for TR, or DE/FR/NL/GB/US/OT for Abroad)
function getClientCityCode(req) {
  const vercelCountry = req.headers['x-vercel-ip-country'];
  
  // 1. Check if voter is from Abroad in production
  if (vercelCountry && vercelCountry !== 'TR') {
    const topCountries = ['DE', 'FR', 'NL', 'GB', 'US'];
    if (topCountries.includes(vercelCountry)) {
      return vercelCountry;
    }
    return 'OT'; // Other Countries fallback
  }

  // 2. Check Vercel edge region header for domestic Turkey voters
  const vercelRegion = req.headers['x-vercel-ip-country-region'];
  if (vercelRegion && /^\d{2}$/.test(vercelRegion)) {
    const codeVal = parseInt(vercelRegion, 10);
    if (codeVal >= 1 && codeVal <= 81) {
      return vercelRegion;
    }
  }

  // 3. Fallback for local development or non-Vercel environment:
  // Konum doğrulanamazsa (lokal testlerde veya Vercel algılayamadığında) varsayılan olarak İstanbul ("34") plaka kodu atanır.
  const FIXED_TEST_LOCATION = process.env.TEST_LOCATION || '34'; 
  return FIXED_TEST_LOCATION;
}

// 2. POST /api/vote - Register a new vote
app.post('/api/vote', async (req, res) => {
  const { candidate } = req.body;
  const ip = getClientIp(req);
  const cityCode = getClientCityCode(req);

  // 1. Bot Flood Protection: Check if IP is currently blocked
  const floodCheck = checkVoteFlood(ip);
  if (floodCheck.blocked) {
    return res.status(429).json({ 
      error: `Çok fazla istek algılandı. Güvenlik kalkanı nedeniyle cihazınız ${floodCheck.remainingMin} dakika engellendi.` 
    });
  }

  // 2. Track request and block if it exceeds 5 requests/min limit
  const record = trackVoteRequest(ip);
  if (record.blockUntil > 0) {
    return res.status(429).json({ 
      error: 'Olağandışı yoğunlukta istek gönderdiniz. Güvenlik kalkanı nedeniyle cihazınız 10 dakika engellendi.' 
    });
  }

  // Validation
  if (!candidate || !['halk', 'kngl'].includes(candidate)) {
    return res.status(400).json({ error: 'Geçersiz aday seçimi.' });
  }

  try {
    // 1. Guard against double-voting
    const alreadyVoted = await db.hasVoted(ip);
    if (alreadyVoted) {
      return res.status(400).json({ error: 'Bu IP adresiyle daha önce oy kullanılmış.' });
    }

    // 2. Insert vote
    const success = await db.castVote(ip, candidate, cityCode);
    if (success) {
      return res.json({ 
        success: true, 
        message: 'Oyunuz başarıyla kaydedildi!',
        city_code: cityCode
      });
    } else {
      return res.status(400).json({ error: 'Oy verme işlemi başarısız oldu. Çift oy denemesi.' });
    }
  } catch (error) {
    console.error('Error casting vote API:', error);
    res.status(500).json({ error: 'Oy verme işlemi sırasında sunucu hatası oluştu.' });
  }
});

// 3. GET /api/results - Fetch overall and city results (Consolidated Single Request)
app.get('/api/results', async (req, res) => {
  try {
    const ip = getClientIp(req);
    // 1. Check if the current IP has voted (always required for frontend state)
    const voted = await db.hasVoted(ip);

    // 2. Brute-force protection: Check if IP is currently blocked
    const bruteCheck = checkBruteForce(ip);
    if (bruteCheck.blocked) {
      return res.json({
        voted,
        results: null,
        error: `Çok fazla hatalı şifre denemesi. Cihazınız ${bruteCheck.remainingMin} dakika kilitlendi.`
      });
    }

    // 3. Validate the password header
    const accessPassword = req.headers['x-access-password'];
    const expectedPassword = process.env.RESULTS_PASSWORD || 'secim2026';
    
    // If no password is provided in header, do not treat it as a failed attempt, just prompt (saves users checking status on load)
    if (!accessPassword) {
      return res.json({
        voted,
        results: null,
        error: 'Şifre doğrulanmadı.'
      });
    }

    const isPasswordCorrect = accessPassword === expectedPassword;

    // 4. If password is wrong, record failed attempt and block if limit reached
    if (!isPasswordCorrect) {
      const record = recordFailedAttempt(ip);
      const remainingAttempts = Math.max(0, 5 - record.count);
      const errorMsg = remainingAttempts === 0
        ? 'Çok fazla hatalı şifre denemesi. Cihazınız 15 dakika kilitlendi.'
        : `Hatalı şifre. Kalan deneme hakkınız: ${remainingAttempts}`;
      
      return res.json({
        voted,
        results: null,
        error: errorMsg
      });
    }

    // 5. If password is correct, clear any failed attempts
    clearFailedAttempts(ip);

    // 6. If they have not voted, we still restrict viewing
    if (!voted) {
      return res.json({
        voted,
        results: null,
        error: 'Sonuçları görebilmek için önce oy kullanmalısınız!'
      });
    }

    // 7. Fetch and return full results
    const results = await db.getElectionResults();
    res.json({
      voted,
      results
    });
  } catch (error) {
    console.error('Error fetching consolidated results API:', error);
    res.status(500).json({ error: 'Sonuçlar yüklenirken sunucu hatası oluştu.' });
  }
});

// 4. GET /api/reset-test - Delete vote for client IP (for testing purposes)
app.get('/api/reset-test', async (req, res) => {
  // Üretim ortamında (production/PostgreSQL) sıfırlama işlemini tamamen engelle!
  if (process.env.DATABASE_URL) {
    return res.status(403).json({ error: 'Bu işlem canlı üretim ortamında devre dışıdır.' });
  }

  try {
    const ip = getClientIp(req);
    await db.resetVote(ip);
    res.json({
      success: true,
      message: 'Test modu: Oy kaydınız başarıyla silindi. Sayfayı yenileyip tekrar oy verebilirsiniz.',
      ip: ip
    });
  } catch (error) {
    console.error('Error resetting vote:', error);
    res.status(500).json({ error: 'Oy silme işlemi sırasında hata oluştu.' });
  }
});

// Wildcard fallback to serve index.html for SPA routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialise Database then Start Server
db.initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`SEÇİM SİMÜLASYONU SUNUCUSU BAŞLATILDI`);
    console.log(`Lokal Adres: http://localhost:${PORT}`);
    console.log(`Ortam: ${process.env.DATABASE_URL ? 'PRODUCTION (PostgreSQL)' : 'DEVELOPMENT (SQLite)'}`);
    console.log(`==================================================`);
  });
}).catch(err => {
  console.error('Database setup failed. Server could not start.', err);
});

module.exports = app; // Required for Vercel Serverless Function export
