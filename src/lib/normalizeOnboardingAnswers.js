/**
 * Maps legacy onboarding payloads to the current shape.
 * Staples list is stored as `staples` (canonical) and duplicated on `q7` for backward compatibility.
 */
function parseDiscoveryPaceRaw(raw) {
  if (raw == null || typeof raw !== 'object') return 3;
  const dp = raw.discoveryPace;
  if (dp != null && Number.isFinite(Number(dp))) {
    return Math.min(5, Math.max(1, Math.round(Number(dp))));
  }
  const q9 = raw.q9 != null ? parseInt(String(raw.q9), 10) : NaN;
  if (Number.isFinite(q9)) return Math.min(5, Math.max(1, q9));
  return 3;
}

function baseFieldsFromRaw(raw) {
  return {
    q1: raw.q1 || { adults: 2, kids: 0, kidAges: [] },
    q2: Array.isArray(raw.q2) ? raw.q2 : [],
    q3: Array.isArray(raw.q3) ? raw.q3 : [],
    q4: raw.q3b || (typeof raw.q4 === 'string' && !Array.isArray(raw.q4) ? raw.q4 : ''),
    q5: Array.isArray(raw.q4) ? raw.q4 : Array.isArray(raw.q5) ? raw.q5 : [],
    q6: raw.q5 && typeof raw.q5 === 'string' ? raw.q5 : raw.q6 || '',
    q8: typeof raw.q8 === 'string' ? raw.q8 : '',
    q9: raw.q9 || '',
    discoveryPace: parseDiscoveryPaceRaw(raw),
  };
}

function normalizeOnboardingAnswers(raw) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  let stapleList = null;
  if (Array.isArray(raw.staples) && raw.staples.length > 0) {
    stapleList = raw.staples;
  } else if (Array.isArray(raw.q7) && raw.q7.length > 0) {
    stapleList = raw.q7;
  }

  const aspirationsRaw = Array.isArray(raw.aspirations) ? raw.aspirations : [];

  if (stapleList) {
    const base = baseFieldsFromRaw(raw);
    const q8 =
      typeof raw.q8 === 'string' && raw.q8
        ? raw.q8
        : typeof raw.q7 === 'string'
          ? raw.q7
          : base.q8 || '';
    return {
      ...base,
      q8,
      staples: stapleList,
      q7: stapleList,
      aspirations: aspirationsRaw,
      discoveryPace: parseDiscoveryPaceRaw(raw),
    };
  }

  const stapleText = typeof raw.q6 === 'string' ? raw.q6 : '';
  const staplesFromLegacyText = stapleText
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 24)
    .map((name, i) => ({
      id: `legacy-${i}-${String(name).slice(0, 24)}`,
      name,
      cuisine: 'Other',
      custom: true,
    }));

  return {
    ...baseFieldsFromRaw(raw),
    q8: typeof raw.q7 === 'string' ? raw.q7 : raw.q8 || '',
    staples: staplesFromLegacyText,
    q7: staplesFromLegacyText,
    aspirations: aspirationsRaw,
    discoveryPace: parseDiscoveryPaceRaw(raw),
  };
}

function staplesListToDescription(staples) {
  if (!Array.isArray(staples) || staples.length === 0) return '';
  return staples
    .map((m) => {
      if (!m || typeof m.name !== 'string') return '';
      const c = m.cuisine ? ` (${m.cuisine})` : '';
      return `${m.name}${c}`;
    })
    .filter(Boolean)
    .join('; ');
}

function aspirationsListToDescription(aspirations) {
  return staplesListToDescription(aspirations);
}

/** Prefer canonical staples array; fall back to legacy q7. */
function getStaplesList(answers) {
  if (!answers || typeof answers !== 'object') return [];
  if (Array.isArray(answers.staples) && answers.staples.length) return answers.staples;
  if (Array.isArray(answers.q7)) return answers.q7;
  return [];
}

function getAspirationsList(answers) {
  if (!answers || typeof answers !== 'object') return [];
  if (Array.isArray(answers.aspirations) && answers.aspirations.length) return answers.aspirations;
  return [];
}

module.exports = {
  normalizeOnboardingAnswers,
  staplesListToDescription,
  rotationToStaplesDescription: staplesListToDescription,
  aspirationsListToDescription,
  getStaplesList,
  getAspirationsList,
};
