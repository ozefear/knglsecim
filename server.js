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

    // 2. Validate the password header
    const accessPassword = req.headers['x-access-password'];
    const expectedPassword = process.env.RESULTS_PASSWORD || 'secim2026';
    const isPasswordCorrect = accessPassword === expectedPassword;

    // 3. If password is wrong or missing, do NOT run expensive database queries for results
    if (!isPasswordCorrect) {
      return res.json({
        voted,
        results: null,
        error: 'Şifre doğrulanmadı.'
      });
    }

    // 4. If password is correct and they have not voted, we still restrict viewing
    if (!voted) {
      return res.json({
        voted,
        results: null,
        error: 'Sonuçları görebilmek için önce oy kullanmalısınız!'
      });
    }

    // 5. If password is correct and voted, fetch and return full results
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
