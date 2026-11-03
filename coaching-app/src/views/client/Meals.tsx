import { useMemo, useState } from 'react';
import { useApp } from '../../context';
import { WEEKDAYS } from '../../types';
import { dayMacros, findFood, foodIndex, isNum, mealMacros, num, swapQuantity } from '../../lib/calc';
import { nutritionSchedule, planOn } from '../../lib/schedule';
import { Empty, Picker } from '../../components/ui';
import { MacroBar } from '../../components/charts';

export function Meals() {
  const { client, data } = useApp();
  const wd = (new Date().getDay() + 6) % 7;
  const plans = client.nutritionDays.filter((d) => !d.archived);
  const todays = planOn(client, wd);
  const [selId, setSelId] = useState(todays?.id ?? plans[0]?.id ?? '');
  const plan = plans.find((p) => p.id === selId) ?? plans[0];
  const idx = useMemo(() => foodIndex(data.foods), [data.foods]);
  const sched = nutritionSchedule(client);

  if (!plan) {
    return (
      <Empty title="No meal plan yet">
        <p>Your coach hasn't added a meal plan. It will appear here when they send it.</p>
      </Empty>
    );
  }
  const total = dayMacros(plan, idx);
  const daysFor = (id: string) => sched.map((x, i) => (x === id ? WEEKDAYS[i].slice(0, 3) : '')).filter(Boolean);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{todays?.id === plan.id ? "Today's meals" : 'Meal plan'}</div>
          <h1>{plan.name}</h1>
          <p>Weigh food the way it's written (cooked or raw). Every “or” option has about the same calories, so swap freely.</p>
        </div>
      </div>

      {plans.length > 1 && (
        <Picker label="Plan" value={plan.id} onChange={setSelId} options={plans.map((p) => ({ id: p.id, label: p.name, sub: daysFor(p.id).join(', ') || undefined }))} />
      )}

      <section className="card stack" style={{ gap: 10 }}>
        <div className="mini-stats">
          <span>
            <b className="figure">{num(total.kcal)}</b> kcal
          </span>
          <span>
            <b className="figure">{num(total.pro)}</b> g protein
          </span>
          <span>
            <b className="figure">{num(total.cho)}</b> g carbs
          </span>
          <span>
            <b className="figure">{num(total.fat)}</b> g fat
          </span>
          {isNum(plan.water) && (
            <span>
              <b className="figure">{num(plan.water, 1)}</b> L water
            </span>
          )}
        </div>
        {total.kcal > 0 && <MacroBar pro={total.pro} cho={total.cho} fat={total.fat} />}
      </section>

      {plan.meals.map((meal) => {
        const m = mealMacros(meal, idx);
        return (
          <section key={meal.id} className="card stack" style={{ gap: 8 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h2>{meal.name}</h2>
              <span className="small muted num">
                {num(m.kcal)} kcal · {num(m.pro)} g protein
              </span>
            </div>
            {meal.notes && <p className="small ink2">{meal.notes}</p>}
            <ul className="food-list">
              {meal.items.map((it) => {
                const f = findFood(idx, it.food);
                const sw = swapQuantity(it, idx);
                return (
                  <li key={it.id}>
                    <span className="food-qty num">
                      {isNum(it.qty) ? num(it.qty, 1) : ''} {f?.unit ?? ''}
                    </span>
                    <span className="food-name">
                      {it.food}
                      {it.swap && (
                        <span className="food-swap">
                          or {sw ? `${num(sw.qty, 1)} ${sw.unit} ` : ''}
                          {it.swap}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </>
  );
}
