import { useEffect, useRef } from "react";

const MessageActionMenu = ({ open, onToggle, options = [] }) => {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) onToggle(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, [open, onToggle]);

  return (
    <div className="qx-msg-menu" ref={menuRef}>
      <button
        type="button"
        className="qx-msg-menu-trigger"
        aria-label="Open message actions"
        onClick={() => onToggle(!open)}
      >
        ⋯
      </button>
      {open && (
        <div className="qx-msg-menu-popover">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`qx-msg-menu-item ${option.danger ? "qx-msg-menu-item--danger" : ""}`}
              onClick={() => {
                option.onClick();
                onToggle(false);
              }}
              disabled={option.disabled}
            >
              <span>{option.icon}</span>
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default MessageActionMenu;
