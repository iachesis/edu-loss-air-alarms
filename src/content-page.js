import { initI18n, setLanguage, tr } from './i18n.js';
import { cleanDashboardUrl, dashboardUrlWithLanguage, lastDashboardUrl, preferredLanguage, saveLanguage, savedLanguage } from './logic.js';

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

function formatSourceTimestamp(value) {
    return new Intl.DateTimeFormat(lang === 'uk' ? 'uk-UA' : 'en-GB', {
        dateStyle: 'long',
        timeStyle: 'medium',
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
            { heading: 'indicators', body: 'Чотири людинозрозумілі показники: (1) «Час повітряних тривог у межах припущеного навчального часу» — тривалість додатного перетину за вибраний період; (2) «Частка припущеного навчального часу, перекрита повітряними тривогами» — секунди перетину, поділені на доступний припущений час; (3) «Припущені навчальні дні з повітряними тривогами в межах припущеного навчального часу» — день враховується лише тоді, коли принаймні одна зафіксована повітряна тривога має додатний перетин із припущеним навчальним часом у межах цього дня, а відсоток — «Частка доступних припущених навчальних днів із повітряними тривогами в межах припущеного навчального часу»; (4) «Епізоди повітряних тривог, що перетнулися з припущеним навчальним часом» — окремі оброблені епізоди за вибраний період. Для областей і України абсолютні значення — середні на одне активне місце розташування закладу; для громади — безпосередній територіальний результат.' },
            { heading: 'weighting', body: 'Показники громад розраховано безпосередньо. Для областей та України абсолютні значення є середніми на одне активне місце розташування закладу освіти, зваженими за кількістю активних закладів у громадах. Тому, наприклад, 87,8 дня є середнім значенням, а не частиною календарного дня одного закладу. Частки обчислюються з відповідних зважених чисельників і знаменників, а не як середнє відсотків.' },
            { heading: 'education', body: 'Кількість закладів і учнів описує освітню мережу та не є спостереженням за присутністю під час тривог. Для 2022/23 очну форму розраховано як загальну кількість учнів мінус дистанційна форма; у наступні роки очну, дистанційну та змішану форми наведено окремо, а інші форми є розрахунковим залишком.' },
            { heading: 'missingness', body: 'Нуль означає, що за наявного потрібного охоплення кваліфікованого перетину не було. Статус «не охоплено джерелом» для UA01 та UA44 означає іншу причину відсутності числа, ніж загальна аналітична недоступність; обидва стани не замінюються нулем. Часткове охоплення позначається окремо. Для довільного багатомісячного діапазону підсумок епізодів не обчислюється, щоб не рахувати двічі епізод на межі місяців.' },
            { heading: 'limitations', body: 'Дашборд не вимірює навчальні втрати, фактично скасовані уроки, відвідування, фактичний час в укриттях, реальні розклади, порушення виконання домашніх завдань, порушення сну чи індивідуальний вплив на учнів. Це не причинна оцінка й не автоматичний інструмент пріоритизації.' },
            { heading: 'releaseInfo', body: `Реліз сайту: ${release.website_release_id}. Нова аналітична побудова: ${release.analytical_build_id}. Порівняння із замороженим контролем не виявило змін фактичних числових показників; виправлено семантику неохоплених територій та походження.` },
        ];
    }
    return [
        { heading: 'methodQuestion', body: 'The dashboard estimates overlap between recorded air-alarm intervals and assumed school operating time. It is a modelled measure of school-day disruption, not an observation of lessons delivered or learner presence.' },
        { heading: 'assumptions', body: 'The common comparison assumption is Monday–Friday, 08:00–15:00 in Europe/Kyiv, excluding periods defined by the school-calendar rules. It is not each school’s actual timetable.' },
        { heading: 'processing', body: 'Alarm timestamps are converted from UTC to Europe/Kyiv with daylight-saving transitions. Exact duplicates are removed, and overlapping or touching intervals are unioned before overlap with the assumed school window is calculated.' },
        { heading: 'geography', body: 'Hromada-level declarations are used directly. Raion- and oblast-level declarations are allocated to their contained hromadas; the original declaration level remains visible through the geographic-precision label.' },
        { heading: 'indicators', body: 'Four reader-facing indicators are used: (1) “Air-alarm time during assumed school hours” is the duration of positive overlap during the selected period; (2) “Share of assumed school time under air alarm” divides those overlap seconds by available assumed school seconds; (3) “Assumed school days with air alarms during assumed school hours” counts a day only when at least one recorded air alarm has positive overlap with assumed school time during that day, while its percentage is the “Share of available assumed school days with air alarms during assumed school hours”; and (4) “Air-alarm episodes overlapping assumed school time” counts distinct processed episodes over the selected period. For oblast and national views, absolute values are averages per active school location; hromada values are direct territorial results.' },
        { heading: 'weighting', body: 'Hromada results are calculated directly. Oblast and national absolute values are averages per active school location, weighted by active schools in hromadas. A value such as 87.8 days is therefore an average, not a fraction of a calendar day experienced by one institution. Shares use the corresponding weighted numerators and denominators; percentages are not averaged.' },
        { heading: 'education', body: 'School and learner figures describe the education network and are not observed presence during alarms. For 2022/23, in-person learners are derived as total minus remote learners. Later years report in-person, remote and mixed modalities separately; other modalities are a derived residual.' },
        { heading: 'missingness', body: 'Zero means the required coverage was present and no qualifying overlap occurred. “Not covered by source” for UA01 and UA44 is a distinct reason for non-numeric results from generic analytical unavailability; neither state is replaced with zero. Partial coverage is labelled separately. A distinct episode total is not produced for an arbitrary multi-month range because one episode may cross a month boundary.' },
        { heading: 'limitations', body: 'The dashboard does not measure learning loss, lessons actually cancelled, attendance, actual shelter time, real school timetables, homework disruption, sleep disruption or individual learner exposure. It is not a causal estimate or an automatic prioritisation tool.' },
        { heading: 'releaseInfo', body: `Website release: ${release.website_release_id}. New analytical build: ${release.analytical_build_id}. Comparison with the frozen control found no change in actual numeric measures; provenance and controlled not-covered semantics were corrected.` },
    ];
}

function dataBlocks() {
    const start = formatSourceDate(release.source_coverage_start_utc);
    const end = formatSourceDate(release.source_coverage_end_utc);
    const retrieved = formatSourceTimestamp(release.source_retrieval_completed_at_utc);
    if (lang === 'uk') {
        return [
            { heading: 'releaseInfo', body: `Кандидат фінального релізу сайту: ${release.website_release_id}. Аналітична побудова: ${release.analytical_build_id} (${release.analytical_build_status}). Фактичні числові показники порівняно із замороженим контролем без відхилень.` },
            { heading: 'sources', body: `Незмінний GitHub-об’єкт ${release.analytical_source_upstream_commit_sha} охоплює період від ${start} до ${end} UTC; отримано та перевірено ${retrieved} UTC. Git blob: ${release.analytical_source_git_blob_sha1}. SHA-256: ${release.analytical_source_sha256}. Охоплення джерела у липні та серпні не означає, що ці місяці додано до навчальних показників: вони й надалі обмежені керованим шкільним календарем.`, link: release.source_url, linkLabel: 'Відкрити незмінне джерело тривог' },
            { heading: 'architecture', body: 'Публікація є статичним сайтом без сервера застосунку та без зовнішніх мережевих запитів під час роботи. До браузера надходять лише агреговані JSON, довідник географії та підготовлені GeoJSON; шкільні рядки й первинний файл тривог не публікуються в інтерфейсі.' },
            { heading: 'geography', body: `Охоплено Україну, 26 територій обласного рівня та ${release.publication_scope.hromada_payload_coverage.controlled_hromadas} контрольовані громади. Для ${release.publication_scope.hromada_geometry_coverage.source_geometry_gaps} громад геометрія відсутня у контрольованому джерелі й не вигадується; їхні аналітичні та табличні результати залишаються доступними.` },
            { heading: 'missingness', body: 'Нуль, часткове охоплення, «не охоплено джерелом», загальна недоступність і відсутність контрольованої геометрії є різними станами. Для UA01 та UA44 джерело не надає постійних сиренних режимів; число нуль не вигадується.' },
            { heading: 'downloadCsv', body: 'CSV відображає поточний географічний рівень і вибраний період. Він містить неокруглені аналітичні значення, стабільні технічні назви полів англійською, статус охоплення та ідентифікатор аналітичної побудови.' },
        ];
    }
    return [
        { heading: 'releaseInfo', body: `Final website release candidate: ${release.website_release_id}. Analytical build: ${release.analytical_build_id} (${release.analytical_build_status}). Actual numeric measures match the frozen control without drift.` },
        { heading: 'sources', body: `Immutable GitHub object ${release.analytical_source_upstream_commit_sha} covers ${start} through ${end} UTC and was retrieved and verified at ${retrieved} UTC. Git blob: ${release.analytical_source_git_blob_sha1}. SHA-256: ${release.analytical_source_sha256}. Source coverage in July and August does not make those months instructional months: metrics remain bounded by the governed school calendar.`, link: release.source_url, linkLabel: 'Open the immutable alarm source' },
        { heading: 'architecture', body: 'The publication is a static site with no application backend and no external network requests at runtime. The browser receives aggregate JSON, the geography catalogue and prepared GeoJSON only; school-level rows and the raw alarm file are not exposed through the interface.' },
        { heading: 'geography', body: `Coverage includes Ukraine, 26 oblast-level territories and ${release.publication_scope.hromada_payload_coverage.controlled_hromadas} controlled hromadas. Geometry is absent from the controlled source for ${release.publication_scope.hromada_geometry_coverage.source_geometry_gaps} hromadas and is not fabricated; their analytical and table results remain available.` },
        { heading: 'missingness', body: 'Covered zero, partial coverage, not covered by source, generic analytical unavailability and unavailable controlled geometry are distinct states. For UA01 and UA44, the source does not supply the permanent siren regimes; no zero value is invented.' },
        { heading: 'downloadCsv', body: 'CSV reflects the current geography level and selected period. It contains unrounded analytical values, stable English technical field names, coverage status and the analytical build identifier.' },
    ];
}

function applyTranslations() {
    document.querySelectorAll('[data-t]').forEach(element => { element.textContent = tr(element.dataset.t); });
    document.querySelectorAll('[data-t-aria-label]').forEach(element => { element.setAttribute('aria-label', tr(element.dataset.tAriaLabel)); });
    document.querySelectorAll('[data-lang]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.lang === lang)));
    document.querySelectorAll('[data-page]').forEach(anchor => { anchor.href = `./${anchor.dataset.page}.html?lang=${lang}`; });
    document.querySelectorAll('[data-footer-org-lang]').forEach(group => { group.hidden = group.dataset.footerOrgLang !== lang; });
    document.getElementById('page-title').href = cleanDashboardUrl(lang);
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
