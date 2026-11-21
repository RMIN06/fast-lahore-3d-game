import { useEffect } from 'react';
import { useTaskStore } from '../state/task-store';

/** Scripted conversation (GAMEPLAY_SPEC §2: 1–9 choose, Esc walks away). */
export function DialogueBox() {
  const dialogue = useTaskStore((s) => s.dialogue);
  const choose = useTaskStore((s) => s.choose);
  const leave = useTaskStore((s) => s.leaveDialogue);

  useEffect(() => {
    if (!dialogue) return;
    const key = (event: KeyboardEvent) => {
      const digit = /^Digit([1-9])$/.exec(event.code);
      if (digit) {
        event.preventDefault();
        choose(Number(digit[1]) - 1);
      } else if (event.code === 'Escape') {
        event.preventDefault();
        leave();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [dialogue, choose, leave]);

  if (!dialogue) return null;
  const { speaker, text, options } = dialogue.runner.current;
  return (
    <section
      className="dialogue"
      role="dialog"
      aria-label="Conversation"
      data-testid="dialogue"
      data-dialogue={dialogue.tree.id}
    >
      <strong data-testid="dialogue-speaker">{speaker}</strong>
      <p data-testid="dialogue-text">{text}</p>
      <ol>
        {options.map((o, i) => (
          <li key={`${dialogue.step}:${i}`}>
            <button
              data-testid={`dialogue-option-${i + 1}`}
              onClick={() => choose(i)}
            >
              <kbd>{i + 1}</kbd> {o}
            </button>
          </li>
        ))}
      </ol>
      <p className="panel__hint">1–9 to answer · Esc to walk away</p>
    </section>
  );
}
