"use client";

export function RangeSettingRow({ label, children }) {
  return (
    <div className="spelling-range-setting-row">
      <span className="spelling-control-label">{label}</span>
      <div className="spelling-range-setting-row__content">{children}</div>
    </div>
  );
}

export function BatchPicker({ value, options = [], onChange, onInteract, ariaLabel = "批次选择" }) {
  const selected = options.find((option) => String(option.value) === String(value)) || options[0];

  return (
    <details className="spelling-batch-picker" onPointerDownCapture={onInteract}>
      <summary className="spelling-batch-picker__trigger">
        <span>{selected?.label || "选择批次"}</span>
      </summary>
      <div className="spelling-batch-picker__menu" role="listbox" aria-label={ariaLabel}>
        {options.map((option) => {
          const active = String(option.value) === String(value);
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={active}
              className={active ? "active" : ""}
              onClick={(event) => {
                onChange?.(option.value);
                event.currentTarget.closest("details")?.removeAttribute("open");
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </details>
  );
}
