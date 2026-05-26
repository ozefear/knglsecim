// Turkey's 81 provinces definition
const TURKEY_CITIES = [
  { code: "01", name: "Adana" }, { code: "02", name: "Adıyaman" }, { code: "03", name: "Afyonkarahisar" },
  { code: "04", name: "Ağrı" }, { code: "05", name: "Amasya" }, { code: "06", name: "Ankara" },
  { code: "07", name: "Antalya" }, { code: "08", name: "Artvin" }, { code: "09", name: "Aydın" },
  { code: "10", name: "Balıkesir" }, { code: "11", name: "Bilecik" }, { code: "12", name: "Bingöl" },
  { code: "13", name: "Bitlis" }, { code: "14", name: "Bolu" }, { code: "15", name: "Burdur" },
  { code: "16", name: "Bursa" }, { code: "17", name: "Çanakkale" }, { code: "18", name: "Çankırı" },
  { code: "19", name: "Çorum" }, { code: "20", name: "Denizli" }, { code: "21", name: "Diyarbakır" },
  { code: "22", name: "Edirne" }, { code: "23", name: "Elazığ" }, { code: "24", name: "Erzincan" },
  { code: "25", name: "Erzurum" }, { code: "26", name: "Eskişehir" }, { code: "27", name: "Gaziantep" },
  { code: "28", name: "Giresun" }, { code: "29", name: "Gümüşhane" }, { code: "30", name: "Hakkari" },
  { code: "31", name: "Hatay" }, { code: "32", name: "Isparta" }, { code: "33", name: "Mersin" },
  { code: "34", name: "İstanbul" }, { code: "35", name: "İzmir" }, { code: "36", name: "Kars" },
  { code: "37", name: "Kastamonu" }, { code: "38", name: "Kayseri" }, { code: "39", name: "Kırklareli" },
  { code: "40", name: "Kırşehir" }, { code: "41", name: "Kocaeli" }, { code: "42", name: "Konya" },
  { code: "43", name: "Kütahya" }, { code: "44", name: "Malatya" }, { code: "45", name: "Manisa" },
  { code: "46", name: "Kahramanmaraş" }, { code: "47", name: "Mardin" }, { code: "48", name: "Muğla" },
  { code: "49", name: "Muş" }, { code: "50", name: "Nevşehir" }, { code: "51", name: "Niğde" },
  { code: "52", name: "Ordu" }, { code: "53", name: "Rize" }, { code: "54", name: "Sakarya" },
  { code: "55", name: "Samsun" }, { code: "56", name: "Siirt" }, { code: "57", name: "Sinop" },
  { code: "58", name: "Sivas" }, { code: "59", name: "Tekirdağ" }, { code: "60", name: "Tokat" },
  { code: "61", name: "Trabzon" }, { code: "62", name: "Tunceli" }, { code: "63", name: "Şanlıurfa" },
  { code: "64", name: "Uşak" }, { code: "65", name: "Van" }, { code: "66", name: "Yozgat" },
  { code: "67", name: "Zonguldak" }, { code: "68", name: "Aksaray" }, { code: "69", name: "Bayburt" },
  { code: "70", name: "Karaman" }, { code: "71", name: "Kırıkkale" }, { code: "72", name: "Batman" },
  { code: "73", name: "Şırnak" }, { code: "74", name: "Bartın" }, { code: "75", name: "Ardahan" },
  { code: "76", name: "Iğdır" }, { code: "77", name: "Yalova" }, { code: "78", name: "Karabük" },
  { code: "79", name: "Kilis" }, { code: "80", name: "Osmaniye" }, { code: "81", name: "Düzce" }
];

// Global State
let electionData = null;
let pollingInterval = null;

// DOM Elements
const loadingContainer = document.getElementById('loading-container');
const gatekeepingContainer = document.getElementById('gatekeeping-container');
const resultsContainer = document.getElementById('results-container');
const lockContainer = document.getElementById('lock-container');
const btnResetTest = document.getElementById('btn-reset-test');
const mapTooltip = document.getElementById('map-tooltip');
const abroadCountriesList = document.getElementById('abroad-countries-list');
const inputLockPassword = document.getElementById('input-lock-password');
const btnUnlockResults = document.getElementById('btn-unlock-results');

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
  // Canlı yayında (localhost veya 127.0.0.1 harici) Sıfırlama butonunu tamamen gizle ve kaldır!
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    const resetBtn = document.getElementById('btn-reset-test');
    if (resetBtn) resetBtn.remove();
  }

  // Bind Unlock Button Click
  btnUnlockResults.addEventListener('click', async () => {
    const pwd = inputLockPassword.value.trim();
    if (!pwd) {
      alert('Lütfen şifreyi boş bırakmayın!');
      return;
    }
    sessionStorage.setItem('results_password', pwd);
    await loadElectionResults();
  });

  // Bind Unlock Input Enter Key
  inputLockPassword.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      btnUnlockResults.click();
    }
  });

  await checkUserStatus();
});

// Check user status and load results in a single consolidated request on load
async function checkUserStatus() {
  await loadElectionResults();
}

// Show/Hide Loading animation
function showLoading(show) {
  if (show) {
    loadingContainer.classList.remove('hidden');
    gatekeepingContainer.classList.add('hidden');
    resultsContainer.classList.add('hidden');
    lockContainer.classList.add('hidden');
  } else {
    loadingContainer.classList.add('hidden');
  }
}

// Show/Hide Gatekeeper screen
function showGatekeeper(show) {
  if (show) {
    gatekeepingContainer.classList.remove('hidden');
    resultsContainer.classList.add('hidden');
    lockContainer.classList.add('hidden');
  } else {
    gatekeepingContainer.classList.add('hidden');
  }
}

// Show/Hide Lock Screen
function showLockScreen(show) {
  if (show) {
    lockContainer.classList.remove('hidden');
    gatekeepingContainer.classList.add('hidden');
    resultsContainer.classList.add('hidden');
  } else {
    lockContainer.classList.add('hidden');
  }
}

// Show/Hide Dashboard Results
function showResults(show) {
  if (show) {
    resultsContainer.classList.remove('hidden');
    gatekeepingContainer.classList.add('hidden');
    lockContainer.classList.add('hidden');
  } else {
    resultsContainer.classList.add('hidden');
  }
}

// Handle Instant Vote Button Clicks
const voteButtons = document.querySelectorAll('.btn-vote');
voteButtons.forEach(button => {
  button.addEventListener('click', async (e) => {
    const candidate = e.currentTarget.getAttribute('data-candidate');

    knglRename = candidate === 'kngl' ? 'ERAY' : 'KNGL';

    const confirmVote = confirm(`Oyunuzu ${knglRename} tarafına kaydetmek istediğinizden emin misiniz?`);
    if (!confirmVote) return;

    // Send vote
    showLoading(true);
    try {
      const response = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate })
      });
      const data = await response.json();

      if (response.ok && data.success) {
        // Resolve city name or country name from city_code
        let locationName = 'Bilinmeyen Konum';
        const cityCode = data.city_code;
        
        const abroadCountriesMap = {
          'DE': 'Almanya',
          'FR': 'Fransa',
          'NL': 'Hollanda',
          'GB': 'İngiltere',
          'US': 'ABD',
          'OT': 'Yurtdışı (Diğer Ülkeler)'
        };
        
        if (abroadCountriesMap[cityCode]) {
          locationName = `Yurtdışı / ${abroadCountriesMap[cityCode]}`;
        } else {
          const foundCity = TURKEY_CITIES.find(c => c.code === cityCode);
          if (foundCity) {
            locationName = `${foundCity.name} (Plaka: ${foundCity.code})`;
          }
        }

        alert(`Oyunuz başarıyla kaydedildi!`);
        // Oy kullandıktan sonra sonuçları şifreyle açması için kilit ekranına yönlendir!
        showLoading(false);
        showLockScreen(true);
      } else {
        alert(data.error || 'Oy kaydı başarısız oldu.');
        showLoading(false);
        showGatekeeper(true);
      }
    } catch (error) {
      console.error('Error submitting vote:', error);
      alert('Oy kaydı sırasında sunucu hatası oluştu.');
      showLoading(false);
      showGatekeeper(true);
    }
  });
});

// Load results and paint dashboard components
async function loadElectionResults() {
  const isFirstLoad = !electionData;
  if (isFirstLoad) {
    showLoading(true);
  }

  try {
    const password = sessionStorage.getItem('results_password') || '';
    const response = await fetch('/api/results', {
      headers: { 'x-access-password': password }
    });

    if (response.status === 401) {
      sessionStorage.removeItem('results_password');
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
      showLoading(false);
      showLockScreen(true);
      if (!isFirstLoad) {
        alert('Hata: Geçersiz veya süresi dolmuş erişim şifresi!');
      } else {
        alert('Hata: Geçersiz erişim şifresi!');
      }
      return;
    }

    const data = await response.json();

    // 1. If the user has NOT voted, they must see the voting gatekeeper screen
    if (!data.voted) {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
      showLoading(false);
      showGatekeeper(true);
      return;
    }

    // 2. If the user HAS voted, but the password is correct/incorrect
    if (data.results === null) {
      // Password was wrong or missing, show lock screen
      sessionStorage.removeItem('results_password');
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
      showLoading(false);
      showLockScreen(true);
      
      // Only show error message if they actually entered a password that failed
      if (password) {
        alert(data.error || 'Hata: Geçersiz veya süresi dolmuş erişim şifresi!');
      }
      return;
    }

    // 3. User HAS voted and password is correct, paint the results dashboard!
    electionData = data.results;

    // 1. Update general stats cards (TRT Haber Presidential Header Style - NO BOX %)
    document.getElementById('summary-total-votes').textContent = Number(electionData.total_votes).toLocaleString('tr-TR');
    
    document.getElementById('halk-percentage').textContent = `%${electionData.halk_percentage.toFixed(2)}`;
    document.getElementById('halk-votes-count').textContent = `${Number(electionData.halk_votes).toLocaleString('tr-TR')} Oy`;
    
    document.getElementById('kngl-percentage').textContent = `%${electionData.kngl_percentage.toFixed(2)}`;
    document.getElementById('kngl-votes-count').textContent = `${Number(electionData.kngl_votes).toLocaleString('tr-TR')} Oy`;

    // 2. Update Dual Progress Bar
    const halkPct = electionData.halk_percentage;
    const knglPct = electionData.kngl_percentage;
    document.getElementById('halk-progress-bar').style.width = `${halkPct}%`;
    document.getElementById('kngl-progress-bar').style.width = `${knglPct}%`;

    // 3. Populate Abroad (Yurtdışı) Results List dynamically (2 lines/candidates per card)
    renderAbroadResults(electionData.abroad);

    // 4. Load and paint interactive SVG Turkey map
    await loadAndColorTurkeyMap();

    // Start 15s polling if not already started
    if (!pollingInterval) {
      pollingInterval = setInterval(loadElectionResults, 15000);
      console.log('Polled data reloading started. Every 15 seconds.');
    }

    showLoading(false);
    showResults(true);

  } catch (error) {
    console.error('Error loading results dashboard:', error);
    alert('Seçim verileri yüklenirken hata oluştu.');
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  }
}

// Render Abroad / Yurtdışı oyları vertical rows list
function renderAbroadResults(abroadData) {
  abroadCountriesList.innerHTML = '';
  
  if (!abroadData || abroadData.length === 0) {
    abroadCountriesList.innerHTML = '<p class="text-xs text-slate-500 uppercase tracking-widest text-center py-6">Yurtdışı oy verisi bulunmamaktadır.</p>';
    return;
  }

  abroadData.forEach(country => {
    // Determine winner details
    const halkLead = country.halk_percentage >= country.kngl_percentage;
    const progressHalk = country.halk_percentage;
    const progressKngl = country.kngl_percentage;

    // Generate lines sorted by who is leading in that country
    const halkHtml = `
      <div class="abroad-candidate-line ${halkLead ? 'winner-line border-red-500/20' : ''}">
        <div class="flex items-center space-x-2 text-red-500 font-extrabold text-[10px]">
          <span class="h-1.5 w-1.5 rounded-full bg-red-500 ${halkLead ? 'animate-pulse' : ''}"></span>
          <span>KNGL</span>
        </div>
        <span class="text-red-400 font-black text-[11px] ml-4">%${country.halk_percentage.toFixed(1)} <span class="text-slate-500 font-bold text-[9px]">(${country.halk_count.toLocaleString('tr-TR')} Oy)</span></span>
      </div>
    `;

    const knglHtml = `
      <div class="abroad-candidate-line ${!halkLead ? 'winner-line border-blue-500/20' : ''}">
        <div class="flex items-center space-x-2 text-blue-500 font-extrabold text-[10px]">
          <span class="h-1.5 w-1.5 rounded-full bg-blue-500 ${!halkLead ? 'animate-pulse' : ''}"></span>
          <span>ERAY</span>
        </div>
        <span class="text-blue-400 font-black text-[11px] ml-4">%${country.kngl_percentage.toFixed(1)} <span class="text-slate-500 font-bold text-[9px]">(${country.kngl_count.toLocaleString('tr-TR')} Oy)</span></span>
      </div>
    `;

    let linesMarkup = '';
    if (halkLead) {
      linesMarkup = halkHtml + knglHtml;
    } else {
      linesMarkup = knglHtml + halkHtml;
    }

    // Determine the progress bar layout dynamically (empty countries show light purple)
    let progressBarHtml = '';
    if (country.total_votes === 0) {
      progressBarHtml = `<div class="w-full bg-purple-500/20 border border-purple-500/10 h-full rounded-full animate-pulse-slow"></div>`;
    } else {
      progressBarHtml = `
        <div class="absolute inset-y-0 left-1/2 w-px bg-white/20 z-10"></div>
        <div class="bg-gradient-to-r from-red-700 to-red-500 h-full" style="width: ${progressHalk}%;"></div>
        <div class="bg-gradient-to-l from-blue-700 to-blue-500 h-full flex-grow" style="width: ${progressKngl}%;"></div>
      `;
    }

    const row = document.createElement('div');
    row.className = 'abroad-row';
    row.innerHTML = `
      <!-- Left: Country Info -->
      <div class="flex items-center space-x-4 min-w-[200px]">
        <div class="h-10 w-10 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center font-black text-xs text-slate-300">
          ${country.country_code}
        </div>
        <div>
          <h4 class="text-xs font-black text-slate-100 uppercase tracking-widest">${country.country_name}</h4>
          <span class="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mt-0.5 block">${Number(country.total_votes).toLocaleString('tr-TR')} Toplam Oy</span>
        </div>
      </div>

      <!-- Center: Mini dual progress bar comparison (empty is light purple) -->
      <div class="flex-grow max-w-md hidden md:block">
        <div class="w-full bg-slate-950/60 border border-white/[0.03] h-2.5 rounded-full overflow-hidden relative flex">
          ${progressBarHtml}
        </div>
      </div>

      <!-- Right: Candidate columns (The 2 lines layout) -->
      <div class="flex flex-col sm:flex-row gap-2 sm:items-center sm:space-x-3">
        ${linesMarkup}
      </div>
    `;
    
    abroadCountriesList.appendChild(row);
  });
}

// Fetch and load Turkey SVG map dynamically inline
async function loadAndColorTurkeyMap() {
  const container = document.getElementById('map-container');
  
  if (container.children.length === 0) {
    try {
      console.log('Fetching public/turkey.svg dynamically...');
      const response = await fetch('/turkey.svg');
      if (!response.ok) throw new Error('Failed to load turkey.svg map');
      const svgText = await response.text();
      container.innerHTML = svgText;
    } catch (err) {
      console.error('Error displaying Turkey SVG map:', err);
      container.innerHTML = `<p class="text-xs text-red-500">Harita yüklenemedi. Detay: ${err.message}</p>`;
      return;
    }
  }

  // Paint the cities based on domestic electionData
  const cityDataList = electionData.cities;
  
  cityDataList.forEach(city => {
    const cityGroup = document.querySelector(`g[data-city-code="${city.city_code}"]`);
    
    if (cityGroup) {
      const paths = cityGroup.querySelectorAll('path');
      paths.forEach(path => {
        path.classList.remove('winner-halk', 'winner-kngl', 'winner-tie');
        
        if (city.winner === 'halk') {
          path.classList.add('winner-halk');
        } else if (city.winner === 'kngl') {
          path.classList.add('winner-kngl');
        } else {
          path.classList.add('winner-tie');
        }
      });

      // Bind dynamic custom interactive events to the group elements
      bindMapEvents(cityGroup, city);
    }
  });
}

// Bind Map interactive hover mouse events for province grouping (sorted tooltip content)
function bindMapEvents(group, cityResult) {
  const cityName = group.getAttribute('data-city-name') || TURKEY_CITIES.find(c => c.code === cityResult.city_code).name;
  const halkLead = cityResult.halk_percentage >= cityResult.kngl_percentage;

  group.addEventListener('mouseenter', () => {
    // Populate city name
    document.getElementById('tooltip-city-name').textContent = `${cityResult.city_code} - ${cityName}`;
    
    // Generate tooltip candidates lines sorted by who is leading in this city
    const halkHtml = `
      <div class="flex items-center justify-between text-red-500 text-[10px] ${halkLead ? 'bg-red-500/[0.03] border border-red-500/10 p-1.5 rounded-lg' : 'opacity-70 p-1.5'}">
          <div class="flex items-center space-x-1.5">
              <span class="h-2 w-2 rounded-full bg-red-500 ${halkLead ? 'animate-pulse' : ''}"></span>
              <span class="font-bold">KNGL:</span>
          </div>
          <span class="font-extrabold">%${cityResult.halk_percentage.toFixed(1)} <span class="text-slate-500 text-[8px]">(${cityResult.halk_count.toLocaleString('tr-TR')} Oy)</span></span>
      </div>
    `;

    const knglHtml = `
      <div class="flex items-center justify-between text-blue-500 text-[10px] ${!halkLead ? 'bg-blue-500/[0.03] border border-blue-500/10 p-1.5 rounded-lg' : 'opacity-70 p-1.5'}">
          <div class="flex items-center space-x-1.5">
              <span class="h-2 w-2 rounded-full bg-blue-500 ${!halkLead ? 'animate-pulse' : ''}"></span>
              <span class="font-bold">ERAY:</span>
          </div>
          <span class="font-extrabold">%${cityResult.kngl_percentage.toFixed(1)} <span class="text-slate-500 text-[8px]">(${cityResult.kngl_count.toLocaleString('tr-TR')} Oy)</span></span>
      </div>
    `;

    const totalHtml = `
      <div class="flex justify-between items-center text-slate-400 text-[9px] border-t border-white/[0.04] pt-2 mt-2 font-bold uppercase tracking-wider">
          <span>Toplam Oy:</span>
          <span class="text-slate-300 font-extrabold">${cityResult.total_votes.toLocaleString('tr-TR')}</span>
      </div>
    `;

    const contentEl = document.getElementById('tooltip-sorted-content');
    
    // Sort and inject content dynamically so leading candidate is at the top
    if (halkLead) {
      contentEl.innerHTML = halkHtml + knglHtml + totalHtml;
    } else {
      contentEl.innerHTML = knglHtml + halkHtml + totalHtml;
    }
    
    mapTooltip.classList.remove('hidden');
    mapTooltip.classList.add('flex', 'flex-col');
  });

  group.addEventListener('mousemove', (e) => {
    // Position floating tooltip next to mouse using fixed viewport coordinates
    const offset = 12;
    mapTooltip.style.left = `${e.clientX}px`;
    mapTooltip.style.top = `${e.clientY - offset}px`;
  });

  group.addEventListener('mouseleave', () => {
    mapTooltip.classList.add('hidden');
  });
}

// Handle Test Mode Reset Button
btnResetTest.addEventListener('click', async () => {
  const confirmReset = confirm('UYARI: Mevcut cihazınızın oy kaydını silerek tekrar oy kullanma moduna dönmek istiyor musunuz? Bu işlem testleri kolaylaştırmak içindir.');
  if (!confirmReset) return;

  try {
    const response = await fetch('/api/reset-test');
    const data = await response.json();
    if (response.ok && data.success) {
      alert(data.message);
      window.location.reload();
    } else {
      alert('Sıfırlama başarısız oldu.');
    }
  } catch (error) {
    console.error('Error resetting test mode:', error);
    alert('Sıfırlama işlemi sırasında sunucu hatası oluştu.');
  }
});
