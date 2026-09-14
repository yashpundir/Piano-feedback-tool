const KEY = "scale-practice-history";

export function loadHistory() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRun(run) {
  const history = loadHistory();
  history.push(run);
  localStorage.setItem(KEY, JSON.stringify(history));
  return history;
}

export function clearHistory() {
  localStorage.removeItem(KEY);
}

export function exportHistoryBlob() {
  const history = loadHistory();
  return new Blob([JSON.stringify(history, null, 2)], { type: "application/json" });
}

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
