// Cell-by-cell check of the app's maths against the values the spreadsheet
// itself calculated (the cached results stored in the .xlsx). Runs only when
// COACH_XLSX points to a client workbook:
//   COACH_XLSX=/path/to/client.xlsx npm test
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { CHECKIN_FIELDS } from '../types';
import { foodIndex, isNum, itemMacros, mealMacros, dayMacros, summarizeWeek, swapQuantity, weeklyRows } from './calc';
import { importWorkbook } from './importer';

const file = process.env.COACH_XLSX;
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function cached(ws: ExcelJS.Worksheet, row: number, col: number): unknown {
  const v = ws.getCell(row, col).value as unknown;
  if (v && typeof v === 'object' && !(v instanceof Date) && 'result' in (v as object)) return (v as { result: unknown }).result;
  return v;
}

/** Cached number; null for blank or ""; undefined when ExcelJS dropped the
 * cached value (it omits results that are exactly 0 or ""). Dates become
 * Excel serial numbers. */
function cachedNum(ws: ExcelJS.Worksheet, row: number, col: number): number | null | undefined {
  const raw = ws.getCell(row, col).value as unknown;
  if (raw && typeof raw === 'object' && !(raw instanceof Date) && !('result' in raw) && ('formula' in raw || 'sharedFormula' in raw)) return undefined;
  const v = cached(ws, row, col);
  if (typeof v === 'number') return v;
  if (v instanceof Date) return (v.getTime() - EXCEL_EPOCH) / 86_400_000;
  return null;
}

/** Sheet blank, "" or 0 all match an app value of 0 or blank. */
function matches(sheet: number | null | undefined, app: number | null | undefined, tol = 1e-9): boolean {
  const s = sheet ?? 0;
  const a = app ?? 0;
  return Math.abs(s - a) <= tol;
}

describe.skipIf(!file)('formulas match the spreadsheet', () => {
  it('check-in weekly averages, meal plans and timeline', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file!);
    const { client, foods } = importWorkbook(wb, 'client.xlsx');
    const problems: string[] = [];
    const deliberate: string[] = [];
    let compared = 0;

    // ---- Check-In: column K of every weekly block
    const ci = wb.getWorksheet('Check-In')!;
    for (let w = 0; w < 52; w++) {
      const start = 4 + 9 * w;
      const week = client.checkIns[w + 1];
      const mine = summarizeWeek(week);
      for (const f of CHECKIN_FIELDS) {
        if (f.agg === 'none') continue;
        const sheet = cachedNum(ci, f.row, start + 7);
        const raw = (week?.days ?? []).map((d) => d[f.key]);
        const label = `Check-In week ${w + 1} ${f.label}`;
        if (f.agg === 'avgClock') {
          if (sheet != null && sheet !== 0) deliberate.push(`${label}: sheet ${(sheet * 24).toFixed(2)} h (plain average), app ${mine[f.key]} (clock average)`);
          continue;
        }
        if (f.agg === 'countText' || f.agg === 'countWorkouts') {
          // The sheet counts every non-empty cell (COUNTA).
          const nonEmpty = raw.filter((v) => v !== undefined && v !== null && v !== '').length;
          compared++;
          if (!matches(sheet, nonEmpty)) problems.push(`${label}: sheet ${sheet}, imported non-empty ${nonEmpty}`);
          const app = (mine[f.key] as number | null) ?? 0;
          if (app !== nonEmpty) deliberate.push(`${label}: sheet counts ${nonEmpty} (includes "No"/"-"/rest), app counts ${app}`);
          continue;
        }
        const app = mine[f.key];
        const appNum = isNum(app) ? app : 0;
        const sheetNum = sheet ?? 0;
        compared++;
        const tol = f.agg === 'avgHours' ? 0.006 : 1e-9;
        if (!matches(sheet, appNum, tol)) problems.push(`${label}: sheet ${sheetNum}, app ${appNum}`);
      }
    }

    // ---- Meal plans: every line, swap, meal total and day total
    const idx = foodIndex(foods);
    for (const ws of wb.worksheets.filter((s) => /^meal plan/i.test(s.name))) {
      for (const c of [7, 25, 43]) {
        if (!/^meal$/i.test(String(cached(ws, 3, c) ?? '')) || !/^food$/i.test(String(cached(ws, 3, c + 1) ?? ''))) continue;
        const dayItems: { kcal: number; pro: number; cho: number; fat: number }[] = [];
        for (let r = 4; r <= 34; r += 6) {
          const mealItems = [];
          for (let i = r; i < r + 6; i++) {
            const food = String(cached(ws, i, c + 1) ?? '').trim();
            if (!food) continue;
            const qty = cachedNum(ws, i, c + 2) ?? null;
            const swap = String(cached(ws, i, c + 13) ?? '').trim();
            const item = { id: 'x', food, qty, swap };
            mealItems.push(item);
            const m = itemMacros(item, idx);
            const where = `${ws.name} ${ws.getCell(i, c).address}`;
            const sheet = {
              kcal: cachedNum(ws, i, c + 5),
              pro: cachedNum(ws, i, c + 6),
              cho: cachedNum(ws, i, c + 7),
              fat: cachedNum(ws, i, c + 8),
            };
            compared += 4;
            for (const k of ['kcal', 'pro', 'cho', 'fat'] as const) {
              const a = m ? m[k] : null;
              if (!matches(sheet[k], a)) problems.push(`${where} ${food} ${k}: sheet ${sheet[k]}, app ${a}`);
            }
            if (m) dayItems.push(m);
            if (swap) {
              const sq = swapQuantity(item, idx);
              const sheetQ = cachedNum(ws, i, c + 14);
              compared++;
              if (!matches(sheetQ, sq?.qty ?? null)) problems.push(`${where} swap ${swap}: sheet ${sheetQ}, app ${sq?.qty}`);
            }
          }
          // Meal totals: Q = SUM of P/C/F, R = 4/4/9 kcal.
          const mm = mealMacros({ id: 'm', name: '', notes: '', items: mealItems }, idx);
          const q = [cachedNum(ws, r, c + 10), cachedNum(ws, r + 2, c + 10), cachedNum(ws, r + 4, c + 10), cachedNum(ws, r, c + 11)];
          compared += 4;
          if (mealItems.length && !(matches(q[0], mm.pro) && matches(q[1], mm.cho) && matches(q[2], mm.fat) && matches(q[3], mm.kcal))) {
            problems.push(`${ws.name} meal at row ${r}: sheet P/C/F/kcal ${q.join('/')}, app ${mm.pro}/${mm.cho}/${mm.fat}/${mm.kcal}`);
          }
        }
        // Day totals on row 2.
        const sum = dayItems.reduce((a, x) => ({ kcal: a.kcal + x.kcal, pro: a.pro + x.pro, cho: a.cho + x.cho, fat: a.fat + x.fat }), { kcal: 0, pro: 0, cho: 0, fat: 0 });
        const row2 = [cachedNum(ws, 2, c + 5), cachedNum(ws, 2, c + 6), cachedNum(ws, 2, c + 7), cachedNum(ws, 2, c + 8)];
        compared += 4;
        if (dayItems.length && !(matches(row2[0], sum.kcal) && matches(row2[1], sum.pro) && matches(row2[2], sum.cho) && matches(row2[3], sum.fat))) {
          problems.push(`${ws.name} day total col ${c}: sheet ${row2.join('/')}, app ${sum.kcal}/${sum.pro}/${sum.cho}/${sum.fat}`);
        }
        // The imported day plan must give the same total.
        const plan = client.nutritionDays.find((d) => d.meals.some((m) => m.items.length) && dayMacros(d, idx).kcal === sum.kcal);
        if (dayItems.length && !plan) problems.push(`${ws.name} col ${c}: no imported day plan totals ${sum.kcal} kcal`);
      }
    }

    // ---- Timeline: E avg BW, F change, G kcal, H cardio, I steps
    const tl = wb.getWorksheet('Timeline')!;
    const rows = weeklyRows(client, 52);
    for (let w = 1; w <= 52; w++) {
      const r = rows[w - 1];
      const pairs: [string, number | null | undefined, number | null][] = [
        ['avg BW', cachedNum(tl, 7 + w, 5), r.avgBw],
        ['kcal', cachedNum(tl, 7 + w, 7), r.kcal],
        ['cardio', cachedNum(tl, 7 + w, 8), r.cardio],
        ['steps', cachedNum(tl, 7 + w, 9), r.steps],
      ];
      for (const [name, s, a] of pairs) {
        compared++;
        if (!matches(s, a)) problems.push(`Timeline week ${w} ${name}: sheet ${s}, app ${a}`);
      }
      const sheetF = cachedNum(tl, 7 + w, 6);
      const prevE = w > 1 ? cachedNum(tl, 6 + w, 5) : null;
      if (sheetF !== null && sheetF !== undefined) {
        compared++;
        if (prevE === null || prevE === undefined) deliberate.push(`Timeline week ${w} change: sheet ${sheetF} (previous week blank, so it subtracts 0), app blank`);
        else if (r.change === null || Math.abs(r.change - sheetF) > 1e-9) problems.push(`Timeline week ${w} change: sheet ${sheetF}, app ${r.change}`);
      }
    }

    if (process.env.COACH_DUMP) {
      console.log(`compared ${compared} values`);
      console.log('problems', problems);
      console.log('deliberate differences', deliberate);
    }
    expect(problems).toEqual([]);
    expect(compared).toBeGreaterThan(500);
  }, 120_000);
});
