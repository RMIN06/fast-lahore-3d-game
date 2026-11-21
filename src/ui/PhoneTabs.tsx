import { useClockStore, gameClock } from '../state/clock-store';
import { useAppStore } from '../state/app-store';
import { useTaskStore } from '../state/task-store';
import { friendMessages, placeLabel } from '../systems/tasks';
import { clock, currentClass } from '../systems/timetable';
import { DAYS } from '../systems/time';

// M10 phone tabs (GAMEPLAY_SPEC §5): Tasks, Timetable, Messages. Everything
// here is session state: finished tasks are not saved (no progression).

const CATEGORY = {
  learning: 'Learning',
  daily: 'Daily life',
  social: 'Social',
  faith: 'Faith',
  explore: 'Explore',
} as const;

const now = () => ({ day: gameClock.day, minutes: gameClock.minutes });

export function TasksTab() {
  useClockStore((s) => s.label); // re-render as time passes
  useTaskStore((s) => s.rev);
  const { engine, timetable, bump } = useTaskStore.getState();
  const setOverlay = useAppStore((s) => s.setOverlay);
  const active = engine.active;
  const hint = engine.hint();
  const tasks = engine.doc.tasks.filter((t) => !t.viaMessages);
  return (
    <div className="phone-tasks">
      {active ? (
        <section aria-label="Active task" data-testid="active-task">
          <h3>{active.task.title}</h3>
          <p data-testid="active-task-step">{hint?.text}</p>
          <button
            onClick={() => {
              engine.abandon();
              bump();
            }}
          >
            Abandon
          </button>
        </section>
      ) : (
        <p>No active task. Pick one below; you can only do one at a time.</p>
      )}
      <ul className="task-list">
        {tasks.map((task) => {
          const a = engine.availability(task, { ...now(), timetable });
          const done = engine.completed.includes(task.id);
          return (
            <li key={task.id} data-testid={`task-${task.id}`}>
              <strong>
                {done ? '✓ ' : ''}
                {task.title}
              </strong>{' '}
              <small>
                {CATEGORY[task.category]} · {a.why}
              </small>
              <p>{task.description}</p>
              <button
                data-testid={`start-${task.id}`}
                disabled={!a.ok || active?.task.id === task.id}
                onClick={() => {
                  if (engine.start(task.id, { ...now(), timetable })) {
                    bump();
                    setOverlay(null);
                  }
                }}
              >
                {active?.task.id === task.id
                  ? 'In progress'
                  : done
                    ? 'Do again'
                    : 'Start'}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="panel__hint">
        Finished tasks are ticked for this session only; nothing is kept or
        scored.
      </p>
    </div>
  );
}

export function TimetableTab({ department }: { department: string }) {
  useClockStore((s) => s.label);
  const timetable = useTaskStore((s) => s.timetable);
  const { day, minutes } = now();
  const next = currentClass(timetable, day, minutes);
  return (
    <div className="phone-timetable">
      <p>
        {department} · generated placeholder timetable (OPEN_QUESTIONS #18).
      </p>
      <table>
        <thead>
          <tr>
            <th>Day</th>
            <th>Time</th>
            <th>Course</th>
            <th>Room</th>
          </tr>
        </thead>
        <tbody>
          {timetable.map((c) => (
            <tr
              key={`${c.day}:${c.from}`}
              className={c === next ? 'now' : c.day === day ? 'today' : ''}
              data-testid={c.day === day ? 'timetable-today' : undefined}
            >
              <td>{DAYS[c.day]}</td>
              <td>
                {clock(c.from)}–{clock(c.to)}
              </td>
              <td>
                {c.courseCode} {c.course}
              </td>
              <td>{c.room}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MessagesTab() {
  useClockStore((s) => s.label);
  useTaskStore((s) => s.rev);
  const { engine, timetable, replied, reply, bump } = useTaskStore.getState();
  const setOverlay = useAppStore((s) => s.setOverlay);
  const roll = useAppStore((s) => s.profile?.rollNumber ?? '');
  const { day, minutes } = now();
  const messages = friendMessages(engine.doc, day, roll).filter(
    (m) => m.sentAt <= minutes,
  );
  if (!messages.length) return <p>No messages yet today.</p>;
  return (
    <ul className="messages">
      {messages.map((m) => {
        const id = `${day}:${m.friendId}`;
        const place = placeLabel(engine.world, m.meet);
        const answer = replied[id];
        return (
          <li key={id} data-testid={`message-${m.friendId}`}>
            <strong>{m.name}</strong> <small>{clock(m.sentAt)}</small>
            <p>
              Free at {m.time}? Meet me at {place}.
            </p>
            {answer ? (
              <small>
                {answer === 'accepted' ? 'You said yes.' : 'You said no.'}
              </small>
            ) : (
              <>
                <button
                  data-testid={`accept-${m.friendId}`}
                  onClick={() => {
                    if (
                      engine.start('meet-friend', {
                        day,
                        minutes,
                        timetable,
                        params: {
                          friend: m.friendId,
                          meet: m.meet,
                          time: m.time,
                        },
                      })
                    ) {
                      reply(id, 'accepted');
                      bump();
                      setOverlay(null);
                    }
                  }}
                >
                  Sure, see you there
                </button>
                <button onClick={() => reply(id, 'declined')}>
                  Can't today
                </button>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
