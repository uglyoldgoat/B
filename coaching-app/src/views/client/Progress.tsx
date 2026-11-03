import { useApp } from '../../context';
import { isNum, latestWeight, num } from '../../lib/calc';
import { Block, signed } from '../../components/ui';
import { MeasurementTiles, WeightChart } from '../../components/progress';
import { Photos } from '../Photos';

export function Progress() {
  const { client, updateClient } = useApp();
  const p = client.profile;
  const latest = latestWeight(client);
  const change = latest && isNum(p.startWeightKg) ? latest.kg - p.startWeightKg : null;
  const goals = [...p.shortTermGoals.map((g, i) => ({ g, i, list: 'shortTermGoals' as const })), ...p.longTermGoals.map((g, i) => ({ g, i, list: 'longTermGoals' as const }))];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Your progress</div>
          <h1>{latest ? `${latest.kg.toFixed(1)} kg` : 'Progress'}</h1>
          <p>
            {latest ? `Your average weight in week ${latest.week}` : 'Log your morning weight to see your trend.'}
            {change !== null && ` · ${signed(change, 1, ' kg')} since you started at ${num(p.startWeightKg, 1)} kg`}
          </p>
        </div>
      </div>

      <Block title="Weight trend" eyebrow="Weekly average">
        <p className="small ink2" style={{ maxWidth: '62ch' }}>
          Daily weight goes up and down with water, salt, sleep and your cycle. The line shows your weekly average, which is what counts. The dots are single days.
        </p>
        <WeightChart client={client} />
      </Block>

      <Block title="Measurements" eyebrow="Change since your first measurement">
        <MeasurementTiles client={client} />
      </Block>

      <Photos embedded simple />

      {goals.length > 0 && (
        <Block title="Your goals">
          <div className="list">
            {goals.map(({ g, i, list }) => (
              <label className="item" key={`${list}-${i}`} style={{ alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={g.done}
                  onChange={(e) =>
                    updateClient((c) => {
                      c.profile[list][i].done = e.target.checked;
                    })
                  }
                />
                <span className="grow" style={g.done ? { textDecoration: 'line-through', color: 'var(--muted)' } : undefined}>
                  {g.text}
                </span>
                <span className="pill">{list === 'shortTermGoals' ? '3 months' : '6–12 months'}</span>
              </label>
            ))}
          </div>
          {p.whys.length > 0 && (
            <div className="quote">
              <span className="eyebrow">Why it matters to you</span>
              <ul className="notes-list">
                {p.whys.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </Block>
      )}
    </>
  );
}
