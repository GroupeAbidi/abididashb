const request = async (path, options = {}) => {
  const response = await fetch(`/api/${path}`, options);
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Sauvegarde indisponible.');
  return response.json();
};

export async function loadSavedState(key) {
  try { return (await request(`state/${key}`)).value; }
  catch (error) { if (error.message === 'Aucune donnée enregistrée.') return null; throw error; }
}

export const saveDashboardState = (key, value) => request(`state/${key}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
});

export const archiveImportedFile = (dashboard, source, file) => request(`imports/${dashboard}/${source}`, {
  method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) }, body: file,
});
