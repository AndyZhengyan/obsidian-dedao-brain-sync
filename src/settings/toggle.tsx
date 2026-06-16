import { useEffect, useRef, useState } from 'preact/hooks';

interface ToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
}

/**
 * Renders an Obsidian-style toggle switch.
 *
 * The markup mirrors the DOM produced by Obsidian's native
 * `ToggleComponent` (`<div class="checkbox-container"><input type="checkbox" .../></div>`)
 * which Obsidian's own app.css styles as a switch. Rendering the markup
 * directly in Preact keeps the test environment synchronous and avoids
 * relying on the imperative Obsidian constructor inside a `useEffect`.
 *
 * In the production Obsidian runtime, the same DOM is also produced by
 * `new ToggleComponent(hostEl)`; here we just inline the resulting
 * structure so the visual treatment stays identical.
 */
export function Toggle({ value, onChange }: ToggleProps) {
  const [currentValue, setCurrentValue] = useState(value);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    setCurrentValue(value);
  }, [value]);

  const applyValue = (next: boolean) => {
    setCurrentValue(next);
    onChangeRef.current(next);
  };

  const handleChange = (event: Event) => {
    applyValue((event.target as HTMLInputElement).checked);
  };

  const handleContainerClick = (event: MouseEvent) => {
    if (event.target instanceof HTMLInputElement) return;
    applyValue(!currentValue);
  };

  return (
    <div
      className={`checkbox-container${currentValue ? ' is-enabled' : ''}`}
      onClick={handleContainerClick}
    >
      <input type="checkbox" checked={currentValue} onChange={handleChange} />
    </div>
  );
}
