// Public client report: a read-only snapshot of one lead, shared by an unguessable link.
// It carries only what the check found plus the sender's contacts — never notes, statuses or scores.

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

// Why each finding matters, in plain words for a business owner (matched by the start of the label).
const WHY = [
  [/^Домен (закінчується|прострочено)/, "Якщо домен не продовжити, сайт і пошта на ньому перестануть працювати, а адресу може викупити хтось інший."],
  [/^SSL-сертифікат закінчується/, "Після цієї дати браузери показуватимуть відвідувачам велике попередження «Небезпечний сайт»."],
  [/^Немає HTTPS/, "Браузер показує «Не захищено» поруч з адресою — частина відвідувачів одразу закриває сайт, а Google ставить його нижче в пошуку."],
  [/^Немає переадресації з http/, "Частина посилань веде на незахищену версію сайту; це легко виправити за кілька хвилин."],
  [/^Не адаптований під телефон/, "Більшість людей шукає з телефона. Без мобільної версії текст дрібний, кнопки не влазять, і людина йде до конкурента."],
  [/^Повільний на телефоні|^Сайт, ймовірно, повільний/, "Якщо сторінка вантажиться довше 3 секунд, понад половина відвідувачів з телефона її закриває, не дочекавшись."],
  [/^Немає зворотного зв'язку/, "Людина, яка хоче замовити чи записатися, не має як швидко це зробити — і пише тим, у кого це в один клік."],
  [/^Немає онлайн-запису|^Немає онлайн-бронювання/, "Клієнти звикли записуватися чи бронювати самі, у будь-який час. Без цього частина звернень губиться, особливо ввечері."],
  [/^Немає кнопок месенджерів/, "Багатьом простіше написати у Viber чи Telegram, ніж дзвонити. Кнопка месенджера додає звернень."],
  [/^Немає форми заявки/, "Не всі готові дзвонити: форма чи месенджер дають людині ще один спосіб звернутися."],
  [/^Телефон не натискається/, "На телефоні номер доводиться переписувати вручну — частина людей так і не дзвонить."],
  [/^WordPress|^Joomla|^Drupal/, "Стара версія системи сайту не отримує оновлень безпеки: такі сайти часто зламують і заражають."],
  [/^Застарілі технології/, "Сучасні браузери й телефони погано показують такі сайти або не показують зовсім."],
  [/^Сайт давно не оновлювався/, "Застаріла інформація знижує довіру: відвідувач не впевнений, чи компанія ще працює."],
  [/^Немає опису для Google/, "Google сам вирізає випадковий шматок тексту для пошуку — оголошення про вас виглядає гірше, ніж могло б."],
  [/^Немає аналітики/, "Без аналітики не видно, скільки людей заходить на сайт і звідки — важко зрозуміти, що працює, а що ні."],
  [/^Стоїть Яндекс/, "Яндекс.Метрика — російський сервіс, заблокований в Україні: дані про ваших відвідувачів ідуть до російської компанії, а частина статистики не збирається."],
  [/^Немає пікселя/, "Без пікселя Meta не можна показати рекламу тим, хто вже заходив на сайт, — а це найдешевші клієнти."],
];
const why = (label) => WHY.find(([re]) => re.test(label))?.[1] || "";

const KIND_TITLE = {
  "no-site": "У компанії немає власного сайту",
  social: "Замість сайту — лише сторінка в соцмережі",
  placeholder: "На адресі сайту — технічна заглушка",
  closed: "Сайт закрито",
  dead: "Сайт не відкривається",
};

const date = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.valueOf()) ? "" : d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Kyiv" });
};

function contacts(sender) {
  if (!sender || !Object.values(sender).some(Boolean)) return "";
  const rows = [];
  if (sender.phone) rows.push(`<a href="tel:${esc(sender.phone.replace(/[^\d+]/g, ""))}">${esc(sender.phone)}</a>`);
  if (sender.telegram) rows.push(`<a href="https://t.me/${esc(sender.telegram.replace(/^@|^https?:\/\/t\.me\//, ""))}">Telegram ${esc(sender.telegram)}</a>`);
  if (sender.email) rows.push(`<a href="mailto:${esc(sender.email)}">${esc(sender.email)}</a>`);
  if (sender.site && /^https?:\/\//.test(sender.site)) rows.push(`<a href="${esc(sender.site)}">${esc(sender.site.replace(/^https?:\/\//, ""))}</a>`);
  return `<section class="card contact"><h2>Як зі мною зв'язатися</h2>${sender.name ? `<p class="who">${esc(sender.name)}</p>` : ""}<p>${rows.join(" · ")}</p>
    <p class="muted">Безкоштовно покажу, як це можна виправити, і скільки це коштуватиме.</p></section>`;
}

export function renderReport(r) {
  const site = r.website ? esc(r.website.replace(/^https?:\/\//, "").replace(/\/$/, "")) : "";
  const hasSite = Boolean(r.website) && (r.kind === "site" || !r.kind);
  const title = hasSite ? `Короткий аудит сайту «${esc(r.name)}»` : `«${esc(r.name)}» в інтернеті`;
  const gaps = [...(r.gaps || [])].sort((a, b) => b.strong - a.strong);
  const speed = typeof r.speed === "number"
    ? `<section class="card speed"><div class="score ${r.speed < 50 ? "bad" : r.speed < 90 ? "mid" : "good"}">${r.speed}<small>/100</small></div>
      <div><h2>Швидкість на телефоні</h2><p>${r.speed < 50 ? "Повільно: частина відвідувачів не дочекається сторінки." : r.speed < 90 ? "Середньо: є що прискорити." : "Добре."}${r.lcp ? ` Основний вміст з'являється за ${esc(r.lcp)}.` : ""}</p>
      <p class="muted">Вимірювання Google Lighthouse у справжньому браузері, як на телефоні.</p></div></section>` : "";
  const shot = typeof r.shot === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(r.shot)
    ? `<section class="card shot"><h2>Так сайт бачить відвідувач з телефона</h2><img src="${r.shot}" alt="Знімок сайту на телефоні" width="250"></section>` : "";
  const situation = !hasSite
    ? `<section class="card"><h2>${esc(KIND_TITLE[r.kind] || "Що ми помітили")}</h2><p>${esc(r.summary)}</p>
      <p class="muted">${r.kind === "no-site" || r.kind === "social"
        ? "Перед тим як звернутися, більшість людей шукає компанію в Google. Власний сайт з цінами, фото, контактами й онлайн-записом приводить клієнтів, яких сторінка в соцмережі не приводить."
        : "Люди, які шукають вас в інтернеті, зараз бачать помилку і, найімовірніше, йдуть до конкурентів."}</p></section>` : "";
  const list = gaps.length
    ? `<section class="card"><h2>Що варто виправити</h2><ul>${gaps.map((g) => `<li class="${g.strong ? "strong" : ""}"><strong>${esc(g.label)}</strong>${why(g.label) ? `<span>${esc(why(g.label))}</span>` : ""}</li>`).join("")}</ul></section>`
    : hasSite ? `<section class="card"><h2>Що ми помітили</h2><p>${esc(r.summary)}</p></section>` : "";
  return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${title}</title>
<style>
:root{--bg:#f4f5f7;--card:#fff;--ink:#1d2430;--muted:#5f6b7a;--line:#e1e5eb;--bad:#c2410c;--mid:#b7791f;--good:#2f855a}
@media (prefers-color-scheme:dark){:root{--bg:#14171c;--card:#1d2128;--ink:#e8ebf0;--muted:#9aa4b2;--line:#2c323b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:720px;margin:0 auto;padding:24px 16px 48px}h1{font-size:1.6rem;line-height:1.25;margin:0 0 6px}h2{font-size:1.1rem;margin:0 0 10px}
.muted{color:var(--muted);font-size:.9rem}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px;margin:14px 0}
ul{margin:0;padding:0;list-style:none}li{padding:10px 0;border-top:1px solid var(--line)}li:first-child{border-top:0}li strong{display:block}
li.strong strong::before{content:"● ";color:var(--bad)}li span{display:block;color:var(--muted);font-size:.93rem;margin-top:2px}
.speed{display:flex;gap:18px;align-items:center}.score{flex:none;width:92px;height:92px;border-radius:50%;display:grid;place-items:center;font-size:1.9rem;font-weight:700;border:6px solid}
.score small{font-size:.8rem;font-weight:400}.score.bad{color:var(--bad);border-color:var(--bad)}.score.mid{color:var(--mid);border-color:var(--mid)}.score.good{color:var(--good);border-color:var(--good)}
.shot img{display:block;max-width:100%;height:auto;border:1px solid var(--line);border-radius:10px}.who{font-weight:650;margin:0 0 4px}a{color:inherit}
.contact{border-color:var(--ink)}@media (max-width:480px){.speed{flex-direction:column;align-items:flex-start}}
</style></head><body><main>
<p class="muted">Перевірено ${esc(date(r.checkedAt))}${site ? ` · ${site}` : ""}${r.city ? ` · ${esc(r.city)}` : ""}</p>
<h1>${title}</h1>
${situation}${speed}${list}${shot}${contacts(r.sender)}
<p class="muted">Звіт складено автоматично за відкритими даними та перевіркою сайту у браузері. Він показує лише те, що видно будь-якому відвідувачу.</p>
</main></body></html>`;
}

export const REPORT_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "private, max-age=300",
};
