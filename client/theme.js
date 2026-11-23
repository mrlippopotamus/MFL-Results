(() => {
  const preference = "mfl-results-theme";
  const root = document.documentElement;

  try {
    if (localStorage.getItem(preference) === "dark") root.dataset.theme = "dark";
  } catch {
    // The theme can still be changed for this visit.
  }

  document.addEventListener("DOMContentLoaded", () => {
    const button = document.getElementById("theme-toggle");
    button.setAttribute("aria-pressed", String(root.dataset.theme === "dark"));
    button.addEventListener("click", () => {
      const dark = root.dataset.theme !== "dark";
      root.dataset.theme = dark ? "dark" : "light";
      button.setAttribute("aria-pressed", String(dark));

      try {
        localStorage.setItem(preference, root.dataset.theme);
      } catch {
        // The current view already reflects the choice.
      }
    });
  }, { once: true });
})();
