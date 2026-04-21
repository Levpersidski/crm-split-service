import React, { useEffect, useMemo, useRef, useState } from "react";

const BASE_TRIGGER_STYLE = {
  width: "100%",
  minHeight: 38,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  padding: "9px 36px 9px 12px",
  color: "#e6f1ff",
  fontSize: 12,
  fontFamily: "inherit",
  lineHeight: 1.2,
  textAlign: "left",
  display: "flex",
  alignItems: "center",
  position: "relative",
  boxSizing: "border-box",
  transition: "border-color 0.16s ease, background 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease",
};

const BASE_MENU_STYLE = {
  position: "absolute",
  top: "calc(100% + 6px)",
  left: 0,
  right: 0,
  background: "#1e1e38",
  border: "1px solid rgba(100,255,218,0.2)",
  borderRadius: 8,
  boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
  maxHeight: 200,
  overflowY: "auto",
  zIndex: 50,
  margin: 0,
  padding: 4,
  listStyle: "none",
  boxSizing: "border-box",
  transition: "opacity 0.16s ease, transform 0.16s ease",
};

const BASE_OPTION_STYLE = {
  width: "100%",
  padding: "9px 12px",
  color: "#e6f1ff",
  cursor: "pointer",
  border: "none",
  background: "transparent",
  fontSize: 12,
  fontFamily: "inherit",
  textAlign: "left",
  borderRadius: 6,
  transition: "background 0.14s ease, color 0.14s ease",
  boxSizing: "border-box",
};

export default function CustomSelect({
  options,
  value,
  onChange,
  placeholder = "Выберите",
  disabled = false,
  className = "",
  triggerStyle,
  menuStyle,
  optionStyle,
  menuZIndex,
}) {
  const wrapperRef = useRef(null);
  const optionRefs = useRef([]);
  const closeTimerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [renderMenu, setRenderMenu] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const normalizedOptions = useMemo(() => Array.isArray(options) ? options : [], [options]);
  const selectedIndex = useMemo(() => normalizedOptions.findIndex((option) => String(option.value) === String(value)), [normalizedOptions, value]);
  const selectedOption = selectedIndex >= 0 ? normalizedOptions[selectedIndex] : null;

  useEffect(() => {
    if (open) {
      setRenderMenu(true);
      return undefined;
    }
    closeTimerRef.current = setTimeout(() => setRenderMenu(false), 160);
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (wrapperRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const handleEscape = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      wrapperRef.current?.querySelector("button")?.focus();
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const nextIndex = selectedIndex >= 0 ? selectedIndex : (normalizedOptions.length ? 0 : -1);
    setActiveIndex(nextIndex);
  }, [open, selectedIndex, normalizedOptions.length]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const commitValue = (nextValue) => {
    onChange?.(nextValue);
    setOpen(false);
  };

  const handleKeyDown = (event) => {
    if (disabled) return;
    if (!open && (event.key === "Enter" || event.key === " " || event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => {
        if (!normalizedOptions.length) return -1;
        if (prev < 0) return 0;
        return Math.min(prev + 1, normalizedOptions.length - 1);
      });
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => {
        if (!normalizedOptions.length) return -1;
        if (prev < 0) return normalizedOptions.length - 1;
        return Math.max(prev - 1, 0);
      });
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex >= 0 && normalizedOptions[activeIndex]) {
        commitValue(normalizedOptions[activeIndex].value);
      }
    }
  };

  return (
    <div ref={wrapperRef} className={className} style={{ position: "relative" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          ...BASE_TRIGGER_STYLE,
          ...(selectedOption ? null : { color: "#5a6a8a" }),
          ...(disabled ? { cursor: "not-allowed", opacity: 0.72 } : { cursor: "pointer" }),
          ...(triggerStyle || {}),
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", width: "100%" }}>
          {selectedOption?.label || placeholder}
        </span>
        <span style={{ position: "absolute", right: 12, top: "50%", transform: `translateY(-50%) ${open ? "rotate(180deg)" : "rotate(0deg)"}`, color: "#5a6a8a", transition: "transform 0.16s ease" }}>▾</span>
      </button>

      {renderMenu && (
        <ul
          role="listbox"
          aria-activedescendant={activeIndex >= 0 ? `custom-select-option-${activeIndex}` : undefined}
          style={{
            ...BASE_MENU_STYLE,
            ...(menuZIndex ? { zIndex: menuZIndex } : null),
            opacity: open ? 1 : 0,
            transform: `translateY(${open ? "0" : "-6px"})`,
            pointerEvents: open ? "auto" : "none",
            ...(menuStyle || {}),
          }}
        >
          {normalizedOptions.map((option, index) => {
            const isSelected = selectedIndex === index;
            const isActive = activeIndex === index;
            return (
              <li key={`${option.value}-${index}`} role="option" aria-selected={isSelected} id={`custom-select-option-${index}`}>
                <button
                  ref={(node) => { optionRefs.current[index] = node; }}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => commitValue(option.value)}
                  style={{
                    ...BASE_OPTION_STYLE,
                    ...(isActive ? { background: "rgba(100,255,218,0.08)" } : null),
                    ...(isSelected ? { color: "#64ffda", fontWeight: 600 } : null),
                    ...(optionStyle || {}),
                  }}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
