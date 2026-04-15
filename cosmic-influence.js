// cosmic-influence.js — Solar activity + Lunar influence for Humanity Pulse
// Sources: NOAA SWPC (solar), USNO (lunar)
const fetch = require('node-fetch');

const SOLAR_API = 'https://services.swpc.noaa.gov/json/f107_cm_flux.json';
const GEOMAG_API = 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json';
const FLARE_API = 'https://services.swpc.noaa.gov/json/solar_flare_events.json';

// Lunar phase calculation (no API needed — pure math)
function getMoonPhase(date = new Date()) {
  // Known new moon: Jan 6 2000 18:14 UTC
  const knownNew = new Date(2000, 0, 6, 18, 14, 0);
  const lunarCycle = 29.53058867; // days
  const diff = (date - knownNew) / (1000 * 60 * 60 * 24);
  const phase = ((diff % lunarCycle) + lunarCycle) % lunarCycle;
  const fraction = phase / lunarCycle; // 0-1

  let name;
  if (fraction < 0.0338) name = 'New Moon';
  else if (fraction < 0.216) name = 'Waxing Crescent';
  else if (fraction < 0.283) name = 'First Quarter';
  else if (fraction < 0.466) name = 'Waxing Gibbous';
  else if (fraction < 0.533) name = 'Full Moon';
  else if (fraction < 0.716) name = 'Waning Gibbous';
  else if (fraction < 0.783) name = 'Last Quarter';
  else if (fraction < 0.966) name = 'Waning Crescent';
  else name = 'New Moon';

  const illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2;

  return {
    phase,
    fraction,
    name,
    illumination: Math.round(illumination * 100),
    dayInCycle: Math.round(phase * 10) / 10
  };
}

// Rate solar activity impact on humanity (-10 to +10)
function rateSolarActivity(solarFlux, kpIndex, flareClass) {
  let score = 0;
  let reasons = [];

  // Solar flux (F10.7 cm) — normal range 60-280
  if (solarFlux) {
    if (solarFlux > 250) {
      score -= 2;
      reasons.push(`Very high solar flux (${solarFlux}) — satellite drag risk`);
    } else if (solarFlux > 180) {
      score -= 1;
      reasons.push(`Elevated solar flux (${solarFlux}) — minor satellite effects`);
    } else if (solarFlux > 70 && solarFlux < 120) {
      score += 1;
      reasons.push(`Quiet solar flux (${solarFlux}) — stable space weather`);
    }
  }

  // Geomagnetic Kp index (0-9)
  if (kpIndex !== null && kpIndex !== undefined) {
    if (kpIndex >= 8) {
      score -= 5;
      reasons.push(`Extreme geomagnetic storm (Kp=${kpIndex}) — power grid, GPS, comms at risk`);
    } else if (kpIndex >= 7) {
      score -= 3;
      reasons.push(`Strong geomagnetic storm (Kp=${kpIndex}) — GPS degradation, aurora visible`);
    } else if (kpIndex >= 5) {
      score -= 1;
      reasons.push(`Minor geomagnetic storm (Kp=${kpIndex}) — minor GPS effects`);
    } else if (kpIndex <= 2) {
      score += 1;
      reasons.push(`Quiet geomagnetic conditions (Kp=${kpIndex})`);
    }
  }

  // Solar flare class
  if (flareClass) {
    if (flareClass.startsWith('X')) {
      const magnitude = parseFloat(flareClass.slice(1));
      if (magnitude >= 10) {
        score -= 7;
        reasons.push(`X${magnitude} superflare — extreme radiation, satellite damage likely`);
      } else if (magnitude >= 5) {
        score -= 5;
        reasons.push(`X${magnitude} flare — significant radiation event`);
      } else {
        score -= 3;
        reasons.push(`X${magnitude} flare — major solar event`);
      }
    } else if (flareClass.startsWith('M')) {
      score -= 1;
      reasons.push(`M-class flare — moderate solar radiation`);
    }
  }

  return {
    score: Math.max(-10, Math.min(10, score)),
    reasons,
    raw: { solarFlux, kpIndex, flareClass }
  };
}

// Rate lunar influence on humanity (-10 to +10)
// Mostly neutral/positive with cultural and practical effects
function rateLunarInfluence(moonPhase) {
  let score = 0;
  let reasons = [];

  // Full moon — minor negative (sleep disruption studies, ER statistics)
  if (moonPhase.name === 'Full Moon') {
    score -= 0.5;
    reasons.push(`Full Moon (${moonPhase.illumination}% illumination) — minor sleep/circadian effects`);
  }

  // New moon — slight positive (astronomy, dark skies)
  if (moonPhase.name === 'New Moon') {
    score += 0.5;
    reasons.push(`New Moon — optimal dark sky conditions for astronomy`);
  }

  // Supermoon (perigee within 90% — would need distance calc, simplified here)
  // Spring tide effects near full/new moon
  if (moonPhase.name === 'Full Moon' || moonPhase.name === 'New Moon') {
    score -= 0.3;
    reasons.push(`${moonPhase.name} — spring tide, elevated coastal flood risk`);
  }

  // Waxing gibbous — mild positive (cultural, fishing)
  if (moonPhase.name === 'Waxing Gibbous') {
    score += 0.2;
    reasons.push(`Waxing Gibbous — traditional fishing/hunting conditions`);
  }

  return {
    score: Math.max(-10, Math.min(10, score)),
    reasons,
    phase: moonPhase
  };
}

// Fetch live solar data from NOAA
async function fetchSolarData() {
  let solarFlux = null;
  let kpIndex = null;
  let flareClass = null;

  try {
    // Solar flux
    const fluxRes = await fetch(SOLAR_API, { timeout: 10000 });
    if (fluxRes.ok) {
      const fluxData = await fluxRes.json();
      if (fluxData.length > 0) {
        solarFlux = fluxData[fluxData.length - 1].flux;
      }
    }
  } catch(e) { console.log('[cosmic] Solar flux fetch failed:', e.message); }

  try {
    // Kp index
    const kpRes = await fetch(GEOMAG_API, { timeout: 10000 });
    if (kpRes.ok) {
      const kpData = await kpRes.json();
      if (kpData.length > 0) {
        kpIndex = kpData[kpData.length - 1].kp_index;
      }
    }
  } catch(e) { console.log('[cosmic] Kp index fetch failed:', e.message); }

  try {
    // Flare events
    const flareRes = await fetch(FLARE_API, { timeout: 10000 });
    if (flareRes.ok) {
      const flareData = await flareRes.json();
      // Get most recent flare in last 24h
      const now = new Date();
      const recentFlare = flareData.find(f => {
        const flareTime = new Date(f.begin_time);
        return (now - flareTime) < 24 * 60 * 60 * 1000;
      });
      if (recentFlare) {
        flareClass = recentFlare.class;
      }
    }
  } catch(e) { console.log('[cosmic] Flare data fetch failed:', e.message); }

  return { solarFlux, kpIndex, flareClass };
}

// Get combined cosmic influence report
async function getCosmicReport() {
  const solarData = await fetchSolarData();
  const moonPhase = getMoonPhase();

  const solarRating = rateSolarActivity(solarData.solarFlux, solarData.kpIndex, solarData.flareClass);
  const lunarRating = rateLunarInfluence(moonPhase);

  const combinedScore = Math.round((solarRating.score + lunarRating.score) * 10) / 10;

  return {
    combined: {
      score: Math.max(-10, Math.min(10, combinedScore)),
      label: combinedScore <= -3 ? 'HIGH IMPACT' : combinedScore <= -1 ? 'MODERATE' : 'LOW'
    },
    solar: solarRating,
    lunar: lunarRating,
    timestamp: new Date().toISOString()
  };
}

module.exports = { getCosmicReport, getMoonPhase, rateSolarActivity, rateLunarInfluence };