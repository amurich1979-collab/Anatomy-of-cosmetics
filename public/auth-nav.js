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
    const { user = null } = await response.json();
    links.forEach((link) => {
      if (user) {
        link.textContent = "Профиль";
        link.href = "/profile";
        link.title = `Профиль: ${user.email}`;
        link.setAttribute("aria-label", `Профиль ${user.email}`);
      } else setSignedOut(link);
      const current = (user && location.pathname === "/profile") || (!user && location.pathname === "/login");
      if (current) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
    });

    if (user) document.querySelectorAll(".topnav").forEach((nav) => {
      if (nav.querySelector("[data-crm-link]")) return;
      const crmLink = document.createElement("a");
      crmLink.dataset.crmLink = "";
      crmLink.href = user.role === "client" ? "/portal" : "/clients";
      crmLink.textContent = user.role === "client" ? "Моя карта" : "Клиенты";
      nav.insertBefore(crmLink, nav.querySelector("[data-auth-link]"));
    });
  } catch {
    links.forEach(setSignedOut);
  }
}

syncAuthNavigation();
