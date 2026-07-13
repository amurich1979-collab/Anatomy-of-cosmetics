async function syncAuthNavigation() {
  const links = document.querySelectorAll("[data-auth-link]");
  if (!links.length) return;

  function setSignedOut(link) {
    link.textContent = "Войти";
    link.href = "/login";
    link.removeAttribute("title");
    link.setAttribute("aria-label", "Войти");
  }

  try {
    const response = await fetch("/api/auth/me");
    const data = await response.json();
    const user = data.user || null;

    links.forEach((link) => {
      if (user) {
        link.textContent = "Профиль";
        link.href = "/profile";
        link.title = `Профиль: ${user.email}`;
        link.setAttribute("aria-label", `Профиль ${user.email}`);
      } else {
        setSignedOut(link);
      }

      if (user && window.location.pathname === "/profile") {
        link.setAttribute("aria-current", "page");
      } else if (!user && window.location.pathname === "/login") {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  } catch {
    links.forEach(setSignedOut);
  }
}

syncAuthNavigation();
