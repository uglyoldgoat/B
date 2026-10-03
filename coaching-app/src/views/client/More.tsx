import { useApp } from '../../context';
import { formatDate, localDate, safeHref } from '../../lib/calc';
import { Block, ConfirmButton } from '../../components/ui';
import { ImportPackage, SendPackage } from '../../components/exchange';

export function More() {
  const { client, data, update, updateClient, notify, preview, go } = useApp();
  const p = client.profile;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">More</div>
          <h1>Files, supplements & help</h1>
        </div>
      </div>

      {!preview && (
        <div className="grid two">
          <section className="card stack" style={{ gap: 10 }}>
            <h2>Send to your coach</h2>
            <p className="small ink2">Sends everything you've logged as a small file. Pick WhatsApp or email in the share menu.</p>
            <SendPackage
              kind="client-update"
              client={client}
              label="Send my check-in"
              onSent={(m) => {
                updateClient((c) => void (c.lastSentAt = new Date().toISOString()));
                notify(m);
              }}
            />
            {client.lastSentAt && <p className="small muted">Last sent {formatDate(localDate(client.lastSentAt), { weekday: 'short', day: 'numeric', month: 'short' })}.</p>}
          </section>
          <section className="card stack" style={{ gap: 10 }}>
            <h2>Files from your coach</h2>
            <p className="small ink2">When your coach sends a new plan or feedback, save the file and open it here. Your own logs are kept.</p>
            <ImportPackage
              data={data}
              apply={update}
              primary={false}
              label="Open file from coach"
              onResult={(r) => notify(r.kind === 'setup' ? 'Your plan is updated' : 'File opened')}
            />
          </section>
        </div>
      )}

      {client.supplements.length > 0 && (
        <Block title="Supplements">
          <div className="list card">
            {client.supplements.map((s) => {
              const link = safeHref(s.link);
              return (
                <div className="item" key={s.id}>
                  <div className="grow stack" style={{ gap: 2 }}>
                    <b>{s.name}</b>
                    <span className="small">
                      {[s.dose, s.timing].filter(Boolean).join(' · ')}
                    </span>
                    {s.notes && <span className="small muted">{s.notes}</span>}
                  </div>
                  {link && (
                    <a className="btn small" href={link} target="_blank" rel="noreferrer">
                      Buy ↗
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </Block>
      )}

      {p.guide.length > 0 && (
        <Block title="Questions & guide">
          <div className="stack" style={{ gap: 8 }}>
            {p.guide.map((g, i) => (
              <details key={i} className="card">
                <summary>
                  <b style={{ color: 'var(--ink)' }}>{g.title}</b>
                </summary>
                <p className="prose">{g.body}</p>
              </details>
            ))}
          </div>
        </Block>
      )}

      <Block title="Words you'll see">
        <dl className="kv">
          <dt>Tempo</dt>
          <dd>How many seconds each part of a rep takes: lowering, pause, lifting, pause.</dd>
          <dt>Reps left / RIR</dt>
          <dd>How many more reps you could have done when you stopped. “2” means stop with two left in the tank.</dd>
          <dt>Warm-up sets</dt>
          <dd>Lighter sets before the real ones. Do fewer reps as the weight gets heavier.</dd>
          <dt>Protein, carbs, fat</dt>
          <dd>The three nutrients that make up calories. Protein matters most for keeping and building muscle.</dd>
          <dt>Weekly average</dt>
          <dd>All of a week's morning weights added up and divided by how many there are. More weigh-ins make it more accurate.</dd>
        </dl>
      </Block>

      {!preview && (
        <section className="stack small muted" style={{ gap: 6 }}>
          <span>Are you the coach? This device is set up for a client.</span>
          <div>
            <ConfirmButton
              className="btn ghost small"
              label="Switch this device to coach mode"
              confirmLabel="Tap again to switch"
              onConfirm={() => {
                update((d) => void (d.mode = 'coach'));
                go('clients');
              }}
            />
          </div>
        </section>
      )}
    </>
  );
}
