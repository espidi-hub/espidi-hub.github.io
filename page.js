import { t, setLang, getLang, detectLang, saveLang } from "./i18n.js";
import { renderLogo } from "./pixels.js";

function render() {
  for (const el of document.querySelectorAll("[data-i18n]"))
    el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll("[data-i18n-label]"))
    el.setAttribute("aria-label", t(el.dataset.i18nLabel));
  for (const el of document.querySelectorAll("[data-lang]"))
    el.setAttribute("aria-pressed", String(el.dataset.lang === getLang()));
}
setLang(detectLang());
for (const b of document.querySelectorAll("[data-lang]"))
  b.onclick = () => {
    setLang(b.dataset.lang);
    saveLang(b.dataset.lang);
    render();
  };
renderLogo(document.querySelector("#logo"));
render();
