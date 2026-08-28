import { initI18n, setLanguage, tr } from './i18n.js';
import { dashboardUrlWithLanguage, lastDashboardUrl, preferredLanguage, saveLanguage, savedLanguage } from './logic.js';

const page = document.body.dataset.page ?? 'methodology';
const explicitLanguage = new URLSearchParams(location.search).get('lang');
let lang = preferredLanguage(explicitLanguage, savedLanguage());
let release;

function dashboardReturnUrl() {
    return dashboardUrlWithLanguage(lastDashboardUrl(`./index.html?lang=${lang}`), lang, location.href);
}

function formatSourceDate(value) {
    return new Intl.DateTimeFormat(lang === 'uk' ? 'uk-UA' : 'en-GB', {
        dateStyle: 'long',
        timeZone: 'UTC',
    }).format(new Date(value));
}

function methodologyBlocks() {
    if (lang === 'uk') {
        return [
            { heading: 'methodQuestion', body: 'Дашборд оцінює перетин зафіксованих інтервалів повітряних тривог із припущеним часом роботи закладів освіти. Це модельований показник порушення навчального дня, а не спостереження за фактичними уроками чи присутністю.' },
            { heading: 'assumptions', body: 'Спільне порівняльне припущення: понеділок–п’ятниця, 08:00–15:00 за Europe/Kyiv, із виключенням передбачених шкільним календарем періодів. Це не фактичний розклад кожного закладу.' },
            { heading: 'processing', body: 'Часові позначки тривог переводяться з UTC до Europe/Kyiv з урахуванням переходів літнього часу. Точні дублікати вилучаються, а перекривні або дотичні інтервали об’єднуються перед розрахунком перетину з навчальним вікном.' },
            { heading: 'geography', body: 'Оголошення на рівні громади використовуються безпосередньо. Оголошення на рівні району або області розподіляються до відповідних громад; початковий рівень оголошення зберігається в позначці географічної точності.' },
            { heading: 'indicators', body: 'Три показники: (1) час тривог у межах навчального дня; (2) навчальні дні з хоча б одним додатним перетином; (3) окремі оброблені епізоди тривог із додатним перетином. Частки обчислюються від доступного припущеного навчального часу або доступних навчальних днів.' },
            { heading: 'weighting', body: 'Показники громад розраховано безпосередньо. Для областей та України абсолютні значення є середніми на одне активне місце розташування закладу освіти, зваженими за кількістю активних закладів у громадах. Тому, наприклад, 87,8 дня є середнім значенням, а не частиною календарного дня одного закладу. Частки обчислюються з відповідних зважених чисельників і знаменників, а не як середнє відсотків.' },
            { heading: 'education', body: 'Кількість закладів і учнів описує освітню мережу та не є спостереженням за присутністю під час тривог. Для 2022/23 очну форму розраховано як загальну кількість учнів мінус дистанційна форма; у наступні роки очну, дистанційну та змішану форми наведено окремо, а інші форми є розрахунковим залишком.' },
            { heading: 'missingness', body: 'Нуль означає, що за наявного потрібного охоплення кваліфікованого перетину не було. Часткове охоплення позначається окремо. Недоступні або неохоплені результати залишаються недоступними й не замінюються нулем. Для довільного багатомісячного діапазону підсумок епізодів не обчислюється, щоб не рахувати двічі епізод на межі місяців.' },
            { heading: 'limitations', body: 'Дашборд не вимірює навчальні втрати, фактично скасовані уроки, відвідування, фактичний час в укриттях, реальні розклади, порушення виконання домашніх завдань, порушення сну чи індивідуальний вплив на учнів. Це не причинна оцінка й не автоматичний інструмент пріоритизації.' },
            { heading: 'releaseInfo', body: `Реліз сайту: ${release.website_release_id}. Аналітична побудова: ${release.analytical_build_id}. Аналітичні значення збережено з замороженої схваленої побудови.` },
        ];
    }
    return [
        { heading: 'methodQuestion', body: 'The dashboard estimates overlap between recorded air-alarm intervals and assumed school operating time. It is a modelled measure of school-day disruption, not an observation of lessons delivered or learner presence.' },
        { heading: 'assumptions', body: 'The common comparison assumption is Monday–Friday, 08:00–15:00 in Europe/Kyiv, excluding periods defined by the school-calendar rules. It is not each school’s actual timetable.' },
        { heading: 'processing', body: 'Alarm timestamps are converted from UTC to Europe/Kyiv with daylight-saving transitions. Exact duplicates are removed, and overlapping or touching intervals are unioned before overlap with the assumed school window is calculated.' },
        { heading: 'geography', body: 'Hromada-level declarations are used directly. Raion- and oblast-level declarations are allocated to their contained hromadas; the original declaration level remains visible through the geographic-precision label.' },
        { heading: 'indicators', body: 'The three measures are: (1) alarm time within the school day; (2) school days with any positive overlap; and (3) distinct processed alarm episodes with positive overlap. Shares use available assumed school time or available school days as the denominator.' },
        { heading: 'weighting', body: 'Hromada results are calculated directly. Oblast and national absolute values are averages per active school location, weighted by active schools in hromadas. A value such as 87.8 days is therefore an average, not a fraction of a calendar day experienced by one institution. Shares use the corresponding weighted numerators and denominators; percentages are not averaged.' },
        { heading: 'education', body: 'School and learner figures describe the education network and are not observed presence during alarms. For 2022/23, in-person learners are derived as total minus remote learners. Later years report in-person, remote and mixed modalities separately; other modalities are a derived residual.' },
        { heading: 'missingness', body: 'Zero means the required coverage was present and no qualifying overlap occurred. Partial coverage is labelled separately. Unavailable or uncovered results remain unavailable and are not replaced with zero. A distinct episode total is not produced for an arbitrary multi-month range because one episode may cross a month boundary.' },
        { heading: 'limitations', body: 'The dashboard does not measure learning loss, lessons actually cancelled, attendance, actual shelter time, real school timetables, homework disruption, sleep disruption or individual learner exposure. It is not a causal estimate or an automatic prioritisation tool.' },
        { heading: 'releaseInfo', body: `Website release: ${release.website_release_id}. Analytical build: ${release.analytical_build_id}. Analytical values are retained from the frozen approved build.` },
    ];
}

function dataBlocks() {
    const start = formatSourceDate(release.source_coverage_start_utc);
    const end = formatSourceDate(release.source_coverage_end_utc);
    if (lang === 'uk') {
        return [
            { heading: 'releaseInfo', body: `Фінальний реліз сайту: ${release.website_release_id}. Статус: фінальний публічний реліз. Аналітична побудова: ${release.analytical_build_id} (${release.analytical_build_status}). Аналітичні значення в цьому релізі не змінено.` },
            { heading: 'sources', body: `Зафіксоване джерело тривог охоплює період від ${start} до ${end} UTC. SHA-256: ${release.analytical_source_sha256}. Час отримання первинного файлу не був записаний у замороженій побудові; цей пропуск збережено явно.`, link: release.source_url, linkLabel: 'Відкрити зафіксоване джерело тривог' },
            { heading: 'architecture', body: 'Публікація є статичним сайтом без сервера застосунку та без зовнішніх мережевих запитів під час роботи. До браузера надходять лише агреговані JSON, довідник географії та підготовлені GeoJSON; шкільні рядки й первинний файл тривог не публікуються в інтерфейсі.' },
            { heading: 'geography', body: `Охоплено Україну, 26 територій обласного рівня та ${release.publication_scope.hromada_payload_coverage.controlled_hromadas} контрольовані громади. Для ${release.publication_scope.hromada_geometry_coverage.source_geometry_gaps} громад геометрія відсутня у контрольованому джерелі й не вигадується; їхні аналітичні та табличні результати залишаються доступними.` },
            { heading: 'missingness', body: 'Нуль, часткове охоплення, недоступність і відсутність контрольованої геометрії є різними станами. Недоступні аналітичні значення не замінюються нулем.' },
            { heading: 'downloadCsv', body: 'CSV відображає поточний географічний рівень і вибраний період. Він містить неокруглені аналітичні значення, стабільні технічні назви полів англійською, статус охоплення та ідентифікатор аналітичної побудови.' },
        ];
    }
    return [
        { heading: 'releaseInfo', body: `Final website release: ${release.website_release_id}. Status: production release. Analytical build: ${release.analytical_build_id} (${release.analytical_build_status}). Analytical values are unchanged in this release.` },
        { heading: 'sources', body: `The frozen alarm source covers ${start} through ${end} UTC. SHA-256: ${release.analytical_source_sha256}. The raw file retrieval time was not recorded in the frozen build; that gap remains explicit.`, link: release.source_url, linkLabel: 'Open the frozen alarm source' },
        { heading: 'architecture', body: 'The publication is a static site with no application backend and no external network requests at runtime. The browser receives aggregate JSON, the geography catalogue and prepared GeoJSON only; school-level rows and the raw alarm file are not exposed through the interface.' },
        { heading: 'geography', body: `Coverage includes Ukraine, 26 oblast-level territories and ${release.publication_scope.hromada_payload_coverage.controlled_hromadas} controlled hromadas. Geometry is absent from the controlled source for ${release.publication_scope.hromada_geometry_coverage.source_geometry_gaps} hromadas and is not fabricated; their analytical and table results remain available.` },
        { heading: 'missingness', body: 'Covered zero, partial coverage, analytical unavailability and unavailable controlled geometry are distinct states. An unavailable analytical value is not replaced with zero.' },
        { heading: 'downloadCsv', body: 'CSV reflects the current geography level and selected period. It contains unrounded analytical values, stable English technical field names, coverage status and the analytical build identifier.' },
    ];
}

function applyTranslations() {
    document.querySelectorAll('[data-t]').forEach(element => { element.textContent = tr(element.dataset.t); });
    document.querySelectorAll('[data-t-aria-label]').forEach(element => { element.setAttribute('aria-label', tr(element.dataset.tAriaLabel)); });
    document.querySelectorAll('[data-lang]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.lang === lang)));
    document.querySelectorAll('[data-support-page]').forEach(anchor => { anchor.href = `./${anchor.dataset.supportPage}.html?lang=${lang}`; });
    document.title = `${tr(page === 'methodology' ? 'methodology' : 'dataRelease')} — ${tr('appTitle')}`;
}

async function render() {
    applyTranslations();
    document.getElementById('back-dashboard').href = dashboardReturnUrl();
    document.getElementById('footer-release').textContent = release.website_release_id;
    document.getElementById('footer-build').textContent = ` · ${release.analytical_build_id}`;
    const main = document.getElementById('content');
    main.replaceChildren();
    const blocks = page === 'methodology' ? methodologyBlocks() : dataBlocks();
    blocks.forEach((block, index) => {
        const section = document.createElement('section');
        section.className = 'prose-section';
        const sectionIndex = document.createElement('span');
        sectionIndex.className = 'section-index';
        sectionIndex.setAttribute('aria-hidden', 'true');
        sectionIndex.textContent = String(index + 1).padStart(2, '0');
        const sectionContent = document.createElement('div');
        sectionContent.className = 'prose';
        const heading = document.createElement('h2');
        heading.textContent = tr(block.heading);
        const paragraph = document.createElement('p');
        paragraph.textContent = block.body;
        sectionContent.append(heading, paragraph);
        if (block.link) {
            const link = document.createElement('a');
            link.href = block.link;
            link.textContent = block.linkLabel;
            sectionContent.append(link);
        }
        section.append(sectionIndex, sectionContent);
        main.append(section);
    });
    document.documentElement.lang = lang;
}

async function switchContentLanguage(nextLanguage, button) {
    if (nextLanguage === lang)
        return;
    const viewport = { x: window.scrollX, y: window.scrollY };
    lang = nextLanguage;
    saveLanguage(lang);
    history.replaceState(null, '', `${location.pathname}?lang=${lang}`);
    await setLanguage(lang);
    await render();
    await new Promise(resolve => requestAnimationFrame(resolve));
    window.scrollTo({ left: viewport.x, top: viewport.y, behavior: 'auto' });
    button.focus({ preventScroll: true });
    await new Promise(resolve => requestAnimationFrame(resolve));
    window.scrollTo({ left: viewport.x, top: viewport.y, behavior: 'auto' });
}

async function init() {
    try {
        await initI18n(lang);
        const response = await fetch('./data/release.json');
        if (!response.ok)
            throw new Error(`release metadata: ${response.status}`);
        release = await response.json();
        const marker = document.querySelector('meta[name="aae-release-id"]')?.content;
        if (marker !== release.website_release_id || document.body.dataset.releaseId !== release.website_release_id)
            throw new Error(tr('releaseMismatch'));
        document.querySelectorAll('[data-lang]').forEach(button => button.addEventListener('click', () => { switchContentLanguage(button.dataset.lang, button); }));
        await render();
    }
    catch (error) {
        console.error(error);
        const message = document.getElementById('content-error');
        message.hidden = false;
        message.textContent = `${tr('fatal')} ${tr('fatalHelp')}`;
    }
}

init();
