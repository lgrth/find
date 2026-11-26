(() => {
  // Persist values of common form controls with an id.
  // Scope-minimized: no globals, runs once after DOMContentLoaded.
  const KEY_PREFIX = "persist:";

  const persistRadioGroup = (name, value) => {
    try { localStorage.setItem(KEY_PREFIX + "radio:" + name, value); } catch(e) {}
  };
  const getPersistedRadio = (name) => {
    try { return localStorage.getItem(KEY_PREFIX + "radio:" + name); } catch(e) { return null; }
  };
  const persistValue = (id, value) => {
    try { localStorage.setItem(KEY_PREFIX + id, value); } catch(e) {}
  };
  const getPersisted = (id) => {
    try { return localStorage.getItem(KEY_PREFIX + id); } catch(e) { return null; }
  };

  document.addEventListener("DOMContentLoaded", () => {
    const controls = Array.from(document.querySelectorAll([
      "select[id]",
      "textarea[id]",
      'input[id][type="text"]',
      'input[id][type="number"]',
      'input[id][type="date"]',
      'input[id][type="time"]',
      'input[id][type="email"]',
      'input[id][type="url"]',
      'input[id][type="checkbox"]',
      'input[id][type="radio"]',
      'input[id]:not([type])' // default text input without type
    ].join(",")));

    // Restore saved values first
    controls.forEach(el => {
      if (el.tagName === "INPUT" && el.type === "radio") {
        const name = el.name || el.id; // fallback to id if no name
        const saved = getPersistedRadio(name);
        if (saved !== null) {
          el.checked = (el.value === saved);
        }
      } else if (el.tagName === "INPUT" && el.type === "checkbox") {
        const saved = getPersisted(el.id);
        if (saved !== null) el.checked = (saved === "true");
      } else {
        const saved = getPersisted(el.id);
        if (saved !== null) el.value = saved;
      }
    });

    // Wire up change listeners
    controls.forEach(el => {
      if (el.tagName === "INPUT" && el.type === "radio") {
        const name = el.name || el.id;
        el.addEventListener("change", () => {
          if (el.checked) persistRadioGroup(name, el.value);
        });
      } else if (el.tagName === "INPUT" && el.type === "checkbox") {
        el.addEventListener("change", () => persistValue(el.id, String(el.checked)));
      } else {
        const handler = () => persistValue(el.id, el.value);
        el.addEventListener("change", handler);
        // Also persist on input for text-like fields
        if (el.tagName !== "SELECT") el.addEventListener("input", handler);
      }
    });
  }, { once: true });
})();
