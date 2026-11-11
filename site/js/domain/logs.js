export function normalizeLogs(json) {
  if (!json) return { buildNumber: null, logs: [] };
  if (Array.isArray(json)) return { buildNumber: null, logs: json };
  return { buildNumber: json.build_number || null, logs: json.data || [] };
}

export function normalizeArrayJson(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  return json.data || [];
}

export function logPageKey(fragment, index) {
  return fragment && fragment.id ? `page:${fragment.id}` : `page:${index + 1}`;
}
