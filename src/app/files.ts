export function downloadJson(filename: string, data: unknown) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export async function readJsonFile(file: File): Promise<unknown> {
  try {
    return JSON.parse(await file.text());
  } catch {
    throw new Error(`${file.name} is not valid JSON.`);
  }
}

export const timestamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
