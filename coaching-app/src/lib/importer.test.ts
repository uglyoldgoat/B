// Runs against a real workbook when COACH_XLSX points to one:
//   COACH_XLSX=/path/to/client.xlsx npm test
// The workbook holds client data, so it is never committed.
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { importWorkbook } from './importer';
import { dayMacros, foodIndex, latestWeight, summarizeWeek, volumeByMuscle, weeklyRows } from './calc';

const file = process.env.COACH_XLSX;

describe.skipIf(!file)('importWorkbook (real file)', () => {
  it('reads the workbook and reproduces the sheet totals', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file!);
    const r = importWorkbook(wb, 'client.xlsx');
    const c = r.client;
    if (process.env.COACH_DUMP) {
      console.log(JSON.stringify({ ...c, checkIns: Object.keys(c.checkIns), logbook: Object.keys(c.logbook).length }, null, 1).slice(0, 6000));
      console.log('notes', r.notes);
      console.log('exercises', r.exercises.length, 'foods', r.foods.length, 'photos', r.photos.length);
      console.log('week1', JSON.stringify(c.checkIns[1], null, 0).slice(0, 3000));
      console.log('summary w1', summarizeWeek(c.checkIns[1]));
      console.log('rows', weeklyRows(c, 12));
      const idx = foodIndex(r.foods);
      console.log('days', c.nutritionDays.map((d) => [d.name, dayMacros(d, idx)]));
      console.log('volume', volumeByMuscle(c.program, r.exercises));
      console.log('logbook', Object.entries(c.logbook).map(([k, v]) => [c.program.flatMap((d) => d.exercises).find((e) => e.id === k)?.name, v.length, JSON.stringify(v[0])]));
    }
    expect(c.profile.name).toBeTruthy();
    expect(c.week1Date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Timeline column E is the cached weekly average from the sheet.
    const tl = wb.getWorksheet('Timeline')!;
    const rows = weeklyRows(c, 52);
    for (let w = 1; w <= 52; w++) {
      const cached = (tl.getCell(7 + w, 5).value as { result?: unknown } | null)?.result;
      if (typeof cached === 'number') expect(rows[w - 1].avgBw).toBeCloseTo(cached, 5);
      const kcal = (tl.getCell(7 + w, 7).value as { result?: unknown } | null)?.result;
      if (typeof kcal === 'number') expect(rows[w - 1].kcal).toBe(kcal);
      const steps = (tl.getCell(7 + w, 9).value as { result?: unknown } | null)?.result;
      if (typeof steps === 'number') expect(rows[w - 1].steps).toBe(steps);
    }
    // Dashboard "current weight".
    const cw = (wb.getWorksheet('Dashboard')!.getCell('E8').value as { result?: unknown }).result;
    if (typeof cw === 'number') expect(latestWeight(c)?.kg).toBeCloseTo(cw, 5);
    // Meal plan day totals match the sheet's DAY TOTAL cells.
    const idx = foodIndex(r.foods);
    const mp = wb.getWorksheet('Meal Plan (1)');
    if (mp && c.nutritionDays.length) {
      const total = (mp.getCell('L2').value as { result?: unknown }).result;
      if (typeof total === 'number') expect(dayMacros(c.nutritionDays[0], idx).kcal).toBe(total);
    }
    // Training volume matches the sheet's volume table.
    const tr = wb.getWorksheet('Training')!;
    const vol = volumeByMuscle(c.program, r.exercises);
    for (let row = 122; row <= 141; row++) {
      const part = (tr.getCell(row, 14).value as { result?: unknown } | null)?.result;
      const sets = (tr.getCell(row, 15).value as { result?: unknown } | null)?.result;
      if (typeof part === 'string' && part && typeof sets === 'number') expect(vol.get(part) ?? 0).toBe(sets);
    }
  }, 60_000);
});
