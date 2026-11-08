const header = document.querySelector(".site-header");
const menuButton = document.querySelector(".menu-btn");

if (menuButton && header) {
  menuButton.addEventListener("click", () => {
    const open = header.classList.toggle("menu-open");
    menuButton.setAttribute("aria-expanded", String(open));
  });
  header.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      header.classList.remove("menu-open");
      menuButton.setAttribute("aria-expanded", "false");
    });
  });
}

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const reveals = document.querySelectorAll(".reveal");

if (reduceMotion || !("IntersectionObserver" in window)) {
  reveals.forEach((element) => element.classList.add("visible"));
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
  );
  reveals.forEach((element) => observer.observe(element));
}

const faqItems = document.querySelectorAll(".faq-list details");
faqItems.forEach((item) => {
  item.addEventListener("toggle", () => {
    if (!item.open) return;
    faqItems.forEach((other) => {
      if (other !== item) other.open = false;
    });
  });
});

const parallax = document.querySelector(".app-mock");
if (parallax && !reduceMotion && window.matchMedia("(min-width: 1021px)").matches) {
  window.addEventListener(
    "pointermove",
    (event) => {
      const x = (event.clientX / window.innerWidth - 0.5) * 2;
      const y = (event.clientY / window.innerHeight - 0.5) * 2;
      parallax.style.transform = `perspective(1400px) rotateY(${-5 + x * 1.5}deg) rotateX(${2 - y * 1.2}deg)`;
    },
    { passive: true },
  );
}
