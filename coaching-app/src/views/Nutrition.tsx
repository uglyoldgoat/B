import { useMemo, useState } from 'react';
import { useApp } from '../context';
import type { DayPlan, Meal } from '../types';
import { dayMacros, findFood, foodIndex, isNum, itemMacros, mealMacros, num, swapQuantity, uid } from '../lib/calc';
import { ConfirmButton, Empty, NumInput, Stat, TextArea, TextInput } from '../components/ui';
import { MacroBar } from '../components/charts';

function newMeal(n: number): Meal {
  return { id: uid('meal'), name: `Meal ${n}`, notes: '', items: [{ id: uid('fi'), food: '', qty: null, swap: '' }] };
}

function cloneDay(d: DayPlan): DayPlan {
  return {
    ...d,
    id: uid('plan'),
    name: `${d.name} (copy)`,
    archived: undefined,
    meals: d.meals.map((m) => ({ ...m, id: uid('meal'), items: m.items.map((i) => ({ ...i, id: uid('fi') })) })),
  };
}

export function Nutrition() {
  const { client, data, updateClient } = useApp();
  const [editing, setEditing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const idx = useMemo(() => foodIndex(data.foods), [data.foods]);
  const visible = client.nutritionDays.filter((d) => showArchived || !d.archived);
  const [selId, setSelId] = useState(visible[0]?.id ?? '');
  const day = client.nutritionDays.find((d) => d.id === selId) ?? visible[0];
  const di = day ? client.nutritionDays.findIndex((d) => d.id === day.id) : -1;
  const archivedCount = client.nutritionDays.filter((d) => d.archived).length;

  const mutateDay = (fn: (d: DayPlan) => void) =>
    updateClient((c) => {
      const d = c.nutritionDays.find((x) => x.id === day?.id);
      if (d) fn(d);
    });

  const addDay = () => {
    const d: DayPlan = { id: uid('plan'), name: `Day ${client.nutritionDays.length + 1}`, water: null, meals: [newMeal(1)] };
    updateClient((c) => void c.nutritionDays.push(d));
    setSelId(d.id);
    setEditing(true);
  };

  if (!day) {
    return (
      <>
        <div className="page-head">
          <div>
            <div className="eyebrow">Nutrition</div>
            <h1>Meal plan</h1>
          </div>
        </div>
        <Empty title="No meal plan yet">
          <p>Build a day from the food library. Calories and macros add up as you go.</p>
          <button className="btn primary" onClick={addDay}>
            Create a day plan
          </button>
        </Empty>
      </>
    );
  }

  const total = dayMacros(day, idx);
  const unknown = day.meals.flatMap((m) => m.items).filter((i) => i.food && !findFood(idx, i.food));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Nutrition</div>
          <h1>Meal plan</h1>
          <p>Each food's macros come from the food library. Swaps are calorie-matched to the food they replace.</p>
        </div>
        <div className="row">
          {editing && (
            <>
              <button className="btn" onClick={addDay}>
                New day
              </button>
              <button
                className="btn"
                onClick={() => {
                  const copy = cloneDay(day);
                  updateClient((c) => void c.nutritionDays.push(copy));
                  setSelId(copy.id);
                }}
              >
                Duplicate
              </button>
            </>
          )}
          <button className={`btn ${editing ? 'primary' : ''}`} onClick={() => setEditing((e) => !e)}>
            {editing ? 'Done editing' : 'Edit plan'}
          </button>
        </div>
      </div>

      <div className="row">
        <div className="seg" role="group" aria-label="Day type">
          {visible.map((d) => (
            <button key={d.id} aria-pressed={d.id === day.id} onClick={() => setSelId(d.id)}>
              {d.name || 'Unnamed'}
              {d.archived ? ' · archived' : ''}
            </button>
          ))}
        </div>
        {archivedCount > 0 && (
          <label className="row small ink2">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show {archivedCount} archived
          </label>
        )}
      </div>

      {editing && (
        <div className="card fields">
          <label className="field">
            <span className="lbl">Day name</span>
            <TextInput value={day.name} onChange={(v) => mutateDay((d) => void (d.name = v))} />
          </label>
          <label className="field">
            <span className="lbl">Water (L)</span>
            <NumInput value={day.water} step={0.25} onChange={(v) => mutateDay((d) => void (d.water = v))} />
          </label>
          <div className="row" style={{ alignSelf: 'end' }}>
            <button className="btn" onClick={() => mutateDay((d) => void (d.archived = d.archived ? undefined : true))}>
              {day.archived ? 'Restore to current plan' : 'Archive'}
            </button>
            <ConfirmButton
              label="Delete day"
              confirmLabel="Click again to delete"
              onConfirm={() =>
                updateClient((c) => {
                  c.nutritionDays.splice(di, 1);
                })
              }
            />
          </div>
        </div>
      )}

      <div className="stats">
        <Stat label="Calories" value={num(total.kcal)} unit="kcal" />
        <Stat label="Protein" value={num(total.pro)} unit="g" sub={isNum(client.profile.startWeightKg) && client.profile.startWeightKg ? `${num(total.pro / client.profile.startWeightKg, 1)} g per kg start weight` : undefined} />
        <Stat label="Carbohydrate" value={num(total.cho)} unit="g" />
        <Stat label="Fat" value={num(total.fat)} unit="g" />
        <Stat label="Water" value={isNum(day.water) ? num(day.water, 1) : '—'} unit="L" />
      </div>
      {total.kcal > 0 && <MacroBar pro={total.pro} cho={total.cho} fat={total.fat} />}
      {unknown.length > 0 && (
        <div className="banner">
          <span className="grow">
            Not in the food library, so not counted: <b>{unknown.map((u) => u.food).join(', ')}</b>. Add them on the Library tab.
          </span>
        </div>
      )}

      <datalist id="food-names">
        {data.foods.map((f) => (
          <option key={f.name} value={f.name} />
        ))}
      </datalist>

      <div className="stack" style={{ gap: 14 }}>
        {day.meals.map((meal, mi) => {
          const mm = mealMacros(meal, idx);
          return (
            <section key={meal.id} className="card stack" style={{ gap: 10 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                {editing ? (
                  <TextInput ariaLabel="Meal name" value={meal.name} onChange={(v) => mutateDay((d) => void (d.meals[mi].name = v))} />
                ) : (
                  <h2>{meal.name}</h2>
                )}
                <span className="small muted num" style={{ whiteSpace: 'nowrap' }}>
                  <b style={{ color: 'var(--ink)' }}>{num(mm.kcal)} kcal</b> · P {num(mm.pro)} · C {num(mm.cho)} · F {num(mm.fat)}
                </span>
              </div>
              {editing ? (
                <TextArea ariaLabel="Meal notes" placeholder="Notes for this meal" value={meal.notes} onChange={(v) => mutateDay((d) => void (d.meals[mi].notes = v))} />
              ) : (
                meal.notes && <p className="small ink2">{meal.notes}</p>
              )}
              <div className="table-wrap" style={{ border: 0 }}>
                <table className="meal-table">
                  <colgroup>
                    <col className="c-food" />
                    <col className="c-amt" />
                    <col className="c-num" />
                    <col className="c-num" />
                    <col className="c-num" />
                    <col className="c-num" />
                    <col />
                    {editing && <col className="c-del" />}
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Food</th>
                      <th className="n">Amount</th>
                      <th className="n">kcal</th>
                      <th className="n">P</th>
                      <th className="n">C</th>
                      <th className="n">F</th>
                      <th>Or swap for</th>
                      {editing && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {meal.items.map((it, ii) => {
                      const f = findFood(idx, it.food);
                      const m = itemMacros(it, idx);
                      const sw = swapQuantity(it, idx);
                      return (
                        <tr key={it.id}>
                          <td>
                            {editing ? (
                              <TextInput ariaLabel="Food" list="food-names" value={it.food} onChange={(v) => mutateDay((d) => void (d.meals[mi].items[ii].food = v))} />
                            ) : (
                              <>
                                {it.food}
                                {f && <span className="pill" style={{ marginLeft: 6 }}>{f.category}</span>}
                              </>
                            )}
                          </td>
                          <td className="n num" style={{ whiteSpace: 'nowrap' }}>
                            {editing ? (
                              <div className="row" style={{ flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                                <span style={{ width: 80 }}>
                                  <NumInput ariaLabel="Amount" value={it.qty} onChange={(v) => mutateDay((d) => void (d.meals[mi].items[ii].qty = v))} />
                                </span>
                                <span className="muted small">{f?.unit}</span>
                              </div>
                            ) : (
                              <>
                                {num(it.qty, 1)} {f?.unit}
                              </>
                            )}
                          </td>
                          <td className="n num">{m ? num(m.kcal) : ''}</td>
                          <td className="n num">{m ? num(m.pro) : ''}</td>
                          <td className="n num">{m ? num(m.cho) : ''}</td>
                          <td className="n num">{m ? num(m.fat) : ''}</td>
                          <td className="small">
                            {editing ? (
                              <TextInput ariaLabel="Swap food" list="food-names" placeholder="Optional" value={it.swap} onChange={(v) => mutateDay((d) => void (d.meals[mi].items[ii].swap = v))} />
                            ) : sw ? (
                              <>
                                <b className="num">
                                  {num(sw.qty, 1)} {sw.unit}
                                </b>{' '}
                                {it.swap}
                              </>
                            ) : (
                              it.swap
                            )}
                          </td>
                          {editing && (
                            <td>
                              <button className="icon-btn" aria-label="Remove food" onClick={() => mutateDay((d) => void d.meals[mi].items.splice(ii, 1))}>
                                ×
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {editing && (
                <div className="row">
                  <button className="btn small" onClick={() => mutateDay((d) => void d.meals[mi].items.push({ id: uid('fi'), food: '', qty: null, swap: '' }))}>
                    Add food
                  </button>
                  <ConfirmButton label="Remove meal" confirmLabel="Click again to remove" onConfirm={() => mutateDay((d) => void d.meals.splice(mi, 1))} />
                </div>
              )}
            </section>
          );
        })}
        {editing && (
          <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => mutateDay((d) => void d.meals.push(newMeal(d.meals.length + 1)))}>
            Add meal
          </button>
        )}
      </div>
    </>
  );
}
