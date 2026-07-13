async function syncAuthNavigation() {
  const links = document.querySelectorAll("[data-auth-link]");
  if (!links.length) return;

  try {
    const response = await fetch("/api/auth/me");
    const data = await response.json();
    const user = data.user || null;

    links.forEach((link) => {
      link.textContent = user ? "Профиль" : "Войти";
      link.href = user ? "/profile" : "/login";
      if (user && window.location.pathname === "/profile") {
        link.setAttribute("aria-current", "page");
      } else if (!user && window.location.pathname === "/login") {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  } catch {
    links.forEach((link) => {
      link.textContent = "Войти";
      link.href = "/login";
    });
  }
}

syncAuthNavigation();
