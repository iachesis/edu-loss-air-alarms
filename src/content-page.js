import { initI18n, setLanguage, tr } from './i18n.js';
import { cleanDashboardUrl, dashboardUrlWithLanguage, lastDashboardUrl, preferredLanguage, saveLanguage, savedLanguage } from './logic.js';

const page = document.body.dataset.page ?? 'methodology';
const explicitLanguage = new URLSearchParams(location.search).get('lang');
let lang = preferredLanguage(explicitLanguage, savedLanguage());
let release;

const SNAPSHOTS = [
    ['2022/23', '2023-01-01'],
    ['2023/24', '2024-04-20'],
    ['2024/25', '2025-03-20'],
    ['2025/26', '2026-03-09'],
];

function dashboardReturnUrl() {
    return dashboardUrlWithLanguage(lastDashboardUrl(`./index.html?lang=${lang}`), lang, location.href);
}

function formatDate(value) {
    return new Intl.DateTimeFormat(lang === 'uk' ? 'uk-UA' : 'en-GB', {
        dateStyle: 'long',
        timeZone: 'UTC',
    }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

function formatDateInSentence(value) {
    const formatted = formatDate(value);
    return lang === 'uk' ? formatted.replace(/\s+р\.$/, ' року') : formatted;
}

function formatInteger(value) {
    return new Intl.NumberFormat(lang === 'uk' ? 'uk-UA' : 'en-GB').format(value);
}

function methodologyBlocks() {
    const isUk = lang === 'uk';
    const labels = isUk
        ? { measure: 'Що вимірює', calculation: 'Розрахунок', unit: 'Одиниця вимірювання', aggregate: 'Тлумачення для областей і України' }
        : { measure: 'What it measures', calculation: 'Calculation', unit: 'Unit', aggregate: 'Aggregate interpretation' };
    const aggregate = isUk
        ? 'Для України та областей абсолютне значення є середнім на одне активне місце розташування закладу освіти з порівнюваним охопленням джерелом тривог.'
        : 'For Ukraine and oblasts, the absolute value is an average per active school location with comparable alarm-source coverage.';
    return isUk ? [
        {
            title: 'Що вимірює цей дашборд',
            paragraphs: [
                'Дашборд вимірює перетин зафіксованих інтервалів повітряних тривог із розрахунковим навчальним часом для вибраної території та періоду.',
                'Він не показує, які уроки фактично були перервані або скасовані.',
            ],
        },
        {
            title: 'Розрахунковий навчальний час',
            callout: 'Розрахунковий навчальний час — це спільне вікно для порівняння: понеділок–п’ятниця, 08:00–15:00 за Europe/Kyiv, без періодів канікул, визначених методологією. Це не фактичний розклад конкретного закладу освіти.',
            bullets: ['Понеділок–п’ятниця', '08:00–15:00', 'Часовий пояс Europe/Kyiv', 'Визначені методологією періоди канікул виключено'],
        },
        {
            title: 'Дані про тривоги та обробка інтервалів',
            paragraphs: ['Часові позначки переведено до Europe/Kyiv. Перед розрахунком вилучено точні дублікати та об’єднано інтервали, що перекриваються або дотикаються.'],
            callout: 'До показників входить лише додатний перетин із розрахунковим навчальним часом.',
        },
        {
            title: 'Географія джерела',
            paragraphs: ['Рівень оголошення тривоги збережено, щоб читачі бачили, наскільки географічно конкретними були вихідні записи.'],
            bullets: [
                'Тривоги, оголошені на рівні громади, застосовуються до цієї громади.',
                'Тривоги, оголошені на рівні району, застосовуються до громад у межах цього району.',
                'Тривоги, оголошені на рівні області, застосовуються до громад у межах цієї області.',
                'Застосування запису ширшого рівня до громади не означає, що в цій громаді було окреме оголошення на рівні громади.',
            ],
        },
        {
            title: 'Показники',
            indicators: [
                {
                    title: 'Час повітряних тривог у межах розрахункового навчального часу',
                    definitions: [
                        [labels.measure, 'Загальна тривалість додатного перетину зафіксованих інтервалів повітряних тривог із розрахунковим навчальним часом у вибраному періоді.'],
                        [labels.calculation, 'секунди перетину ÷ 3 600'],
                        [labels.unit, 'Години'],
                        [labels.aggregate, aggregate],
                    ],
                },
                {
                    title: 'Частка розрахункового навчального часу під час повітряних тривог',
                    definitions: [
                        [labels.measure, 'Частка розрахункового навчального часу з порівнюваним охопленням джерела, що перетинається із зафіксованими повітряними тривогами.'],
                        [labels.calculation, 'секунди перетину ÷ секунди розрахункового навчального часу з охопленням × 100'],
                        [labels.unit, 'Відсоток'],
                        [labels.aggregate, 'Частку розраховано зі зважених чисельника і знаменника; відсотки громад не усереднюються.'],
                    ],
                },
                {
                    title: 'Розрахункові навчальні дні з повітряною тривогою',
                    definitions: [
                        [labels.measure, 'День враховується лише тоді, коли принаймні одна зафіксована повітряна тривога має додатний перетин із розрахунковим навчальним часом цього дня.'],
                        [labels.calculation, 'Кількість днів із перетином; частка = дні з перетином ÷ розрахункові навчальні дні з охопленням × 100'],
                        [labels.unit, 'Дні та відсоток'],
                        [labels.aggregate, aggregate],
                    ],
                },
                {
                    title: 'Епізоди повітряних тривог у межах розрахункового навчального часу',
                    definitions: [
                        [labels.measure, 'Окремі оброблені епізоди повітряних тривог із принаймні одним додатним перетином із розрахунковим навчальним часом у вибраному періоді.'],
                        [labels.calculation, 'Кількість окремих оброблених епізодів із додатним перетином'],
                        [labels.unit, 'Епізоди'],
                        [labels.aggregate, aggregate],
                    ],
                    note: 'Епізод може тривати понад один день і враховується один раз. Значення за навчальний рік обчислюється для всього навчального року. Для довільного багатомісячного діапазону окремий підсумок не наводиться, оскільки сума місячних значень може двічі врахувати епізод на межі місяців.',
                },
            ],
        },
        {
            title: 'Як розраховано значення для територій',
            paragraphs: [
                'Для зважування активним місцем розташування закладу освіти вважається включений запис закладу у вибраному освітньому зрізі, який має валідний зв’язок із громадою та принаймні одного учня. Кожен включений заклад має однакову вагу; кількість учнів як вага не використовується.',
                'Кількість закладів і учнів описує всю включену освітню мережу. Агреговані показники тривог використовують як аналітичний знаменник лише активні місця розташування закладів освіти з порівнюваним охопленням джерелом тривог.',
            ],
            subsections: [
                { title: 'Громада', paragraphs: ['Значення розраховано для громади в цілому; це не середнє значення на один заклад.'] },
                {
                    title: 'Область та Україна',
                    bullets: [
                        'Громади зважуються за кількістю активних закладів освіти.',
                        'Час, кількість днів і кількість епізодів є середніми на одне активне місце розташування закладу освіти з порівнюваним охопленням джерелом тривог.',
                        'Частки розраховуються зі зважених чисельників і знаменників, а не як середнє значення відсотків.',
                        'Години тривог у громадах не можна просто додати, щоб отримати загальнонаціональне значення.',
                    ],
                },
            ],
        },
        {
            title: 'Освітній контекст',
            paragraphs: [
                'Кількість закладів і учнів описує освітню мережу, а не присутність або досвід під час повітряних тривог. Дані окремих закладів на сайті не публікуються.',
                'Для 2022/23 кількість учнів на очній формі розраховано як загальну кількість мінус кількість на дистанційній формі, оскільки детальніший розподіл був недоступний. У наступні роки очну, дистанційну та змішану форми наведено окремо. «Інші форми» — залишок після віднімання цих категорій від загальної кількості.',
            ],
            table: { headers: ['Навчальний рік', 'Використаний зріз освітніх даних'], rows: SNAPSHOTS.map(([year, date]) => [year, formatDate(date)]) },
        },
        {
            title: 'Охоплення та відсутні значення',
            definitions: [
                ['0', 'Джерело охоплює відповідний розрахунковий навчальний час, а розрахований перетин справді дорівнює нулю.'],
                ['Часткове охоплення', 'Результат можна розрахувати, але порівнюване охоплення джерела доступне не для всього очікуваного розрахункового навчального часу або не для всіх складових території.'],
                ['Не охоплено джерелом', 'Джерело тривог не вважається порівнюваним для цієї території в межах методології. У цьому релізі так позначено Автономну Республіку Крим та Луганську область.'],
                ['Недоступно', 'Результат неможливо розрахувати з іншої причини, пов’язаної з даними.'],
                ['Геометрія на карті недоступна', 'Значення може існувати, але у використаному джерелі карти немає геометрії цієї громади.'],
            ],
        },
        {
            title: 'Обмеження',
            paragraphs: ['Дашборд не встановлює:'],
            bullets: ['фактично скасовані уроки', 'відвідування', 'час перебування в укриттях', 'фактичний розклад окремого закладу', 'навчальні втрати', 'причинні освітні наслідки', 'вплив на окремого учня'],
            link: { href: './data.html', label: 'Дані та реліз: джерела, дати й технічна інформація' },
        },
    ] : [
        {
            title: 'What this dashboard measures',
            paragraphs: [
                'The dashboard measures overlap between recorded air-alarm intervals and modelled school hours for the selected territory and period.',
                'It does not show which lessons were actually interrupted or cancelled.',
            ],
        },
        {
            title: 'Modelled school hours',
            callout: 'Modelled school hours are a common comparison window: Monday to Friday, 08:00–15:00 in Europe/Kyiv, excluding the school-break periods used by this methodology. They are not the actual timetable of any individual school.',
            bullets: ['Monday to Friday', '08:00–15:00', 'Europe/Kyiv time zone', 'School-break periods specified by the methodology are excluded'],
        },
        {
            title: 'Alarm data and interval processing',
            paragraphs: ['Timestamps are converted to Europe/Kyiv. Exact duplicates are removed, and overlapping or touching intervals are merged before calculation.'],
            callout: 'Only positive overlap with modelled school hours contributes to the indicators.',
        },
        {
            title: 'Source geography',
            paragraphs: ['The alarm reporting level is retained so readers can see how geographically specific the source records were.'],
            bullets: [
                'Alarms reported at hromada level are used for that hromada.',
                'Alarms reported at raion level are applied to hromadas in that raion.',
                'Alarms reported at oblast level are applied to hromadas in that oblast.',
                'Applying a broader record to a hromada does not mean that a separate hromada-level observation occurred.',
            ],
        },
        {
            title: 'Indicators',
            indicators: [
                {
                    title: 'Air-alarm time during modelled school hours',
                    definitions: [
                        [labels.measure, 'Total duration of positive overlap between recorded air-alarm intervals and modelled school hours during the selected period.'],
                        [labels.calculation, 'overlap seconds ÷ 3,600'],
                        [labels.unit, 'Hours'],
                        [labels.aggregate, aggregate],
                    ],
                },
                {
                    title: 'Share of modelled school time under air alarm',
                    definitions: [
                        [labels.measure, 'Overlap time divided by modelled school time for which comparable alarm-source coverage is available.'],
                        [labels.calculation, 'overlap seconds ÷ covered modelled-school seconds × 100'],
                        [labels.unit, 'Per cent'],
                        [labels.aggregate, 'The share is calculated from weighted numerators and denominators; hromada percentages are not averaged.'],
                    ],
                },
                {
                    title: 'Modelled school days with an air alarm',
                    definitions: [
                        [labels.measure, 'A day is counted only when at least one recorded air alarm has positive overlap with modelled school hours on that day.'],
                        [labels.calculation, 'Count of days with overlap; share = days with overlap ÷ covered modelled school days × 100'],
                        [labels.unit, 'Days and per cent'],
                        [labels.aggregate, aggregate],
                    ],
                },
                {
                    title: 'Air-alarm episodes during modelled school hours',
                    definitions: [
                        [labels.measure, 'Distinct processed air-alarm episodes with at least one positive overlap with modelled school hours during the selected period.'],
                        [labels.calculation, 'count of distinct processed episodes with positive overlap'],
                        [labels.unit, 'Episodes'],
                        [labels.aggregate, aggregate],
                    ],
                    note: 'A distinct processed episode can span more than one day and is counted once. School-year values are calculated for the whole school year. A separate episode total is not shown for an arbitrary multi-month range because summing monthly counts could count an episode crossing a month boundary twice.',
                },
            ],
        },
        {
            title: 'How territory-level results are calculated',
            paragraphs: [
                'For weighting, an active school location is an included school record in the selected education snapshot with a valid hromada link and at least one learner. Each included school contributes one unit of weight; learner counts are not used as weights.',
                'School and learner totals describe the full included education network. Aggregate alarm measures use only active school locations with comparable alarm-source coverage as their analytical denominator.',
            ],
            subsections: [
                { title: 'Hromada', paragraphs: ['The value is calculated for the hromada as a whole; it is not an average per school.'] },
                {
                    title: 'Oblast and Ukraine',
                    bullets: [
                        'Hromadas are weighted by their number of active schools.',
                        'Hours, days and episode counts are averages per active school location with comparable alarm-source coverage.',
                        'Shares are calculated from weighted numerators and denominators; percentages are not averaged.',
                        'Hromada alarm hours cannot simply be summed to produce a national figure.',
                    ],
                },
            ],
        },
        {
            title: 'Education context',
            paragraphs: [
                'School and learner counts describe the education network, not attendance or experience during air alarms. School-level rows are not published through the site.',
                'For 2022/23, in-person learners are derived as total learners minus remote learners because the more detailed modality split was unavailable. In later years, in-person, remote and mixed learners are reported separately. “Other modalities” is the remaining number after those categories are subtracted from the total.',
            ],
            table: { headers: ['School year', 'Education snapshot used'], rows: SNAPSHOTS.map(([year, date]) => [year, formatDate(date)]) },
        },
        {
            title: 'Coverage and missing values',
            definitions: [
                ['0', 'The source covers the relevant modelled school time and the calculated overlap is genuinely zero.'],
                ['Partial coverage', 'A result can be calculated, but not all expected modelled school time or territory components have comparable source coverage.'],
                ['Not covered by source', 'The alarm source is not considered comparable for that territory under this methodology. Crimea and Luhansk Oblast are treated as Not covered by source in this release.'],
                ['Unavailable', 'The result cannot be calculated for another data reason.'],
                ['Map geometry unavailable', 'A value may exist, but the map source used by the site lacks a geometry for that hromada.'],
            ],
        },
        {
            title: 'Limitations',
            paragraphs: ['The dashboard does not establish:'],
            bullets: ['actual lesson cancellations', 'attendance', 'time spent in shelters', 'actual individual-school schedules', 'learning loss', 'causal educational effects', 'individual learner exposure'],
            link: { href: './data.html', label: 'Data & release: sources, dates and technical information' },
        },
    ];
}

function dataBlocks() {
    const coverageStart = formatDateInSentence(release.source_coverage_start_utc);
    const coverageEnd = formatDateInSentence(release.source_coverage_end_utc);
    const retrieved = formatDateInSentence(release.source_retrieval_completed_at_utc);
    const scope = release.publication_scope;
    if (lang === 'uk') {
        return [
            {
                title: 'Реліз у цифрах',
                definitions: [
                    ['Статус', 'Фінальний публічний реліз'],
                    ['Навчальні роки', '2022/23–2025/26'],
                    ['Дані про повітряні тривоги до', coverageEnd],
                ],
            },
            {
                title: 'Дані про повітряні тривоги',
                paragraphs: [
                    `Використано опублікований файл official_data_uk.csv з набору даних Ukrainian Air Raid Sirens Dataset. Дані джерела охоплюють період від ${coverageStart} до ${coverageEnd}. Файл отримано й перевірено ${retrieved}.`,
                    'Навіть якщо вихідний файл містить записи за липень і серпень, навчальні показники обмежено розрахунковим навчальним часом і місяцями шкільного календаря з вересня до червня.',
                ],
                link: { href: release.source_url, label: 'Відкрити використаний файл даних про тривоги', external: true },
            },
            {
                title: 'Освітні дані',
                paragraphs: [
                    'Кількість закладів і учнів походить із вибраних зрізів даних на рівні закладів освіти та описує всю включену освітню мережу. Агреговані показники тривог використовують лише вагу активних місць розташування закладів освіти з порівнюваним охопленням джерелом тривог.',
                ],
                table: { headers: ['Навчальний рік', 'Використаний зріз'], rows: SNAPSHOTS.map(([year, date]) => [year, formatDate(date)]) },
            },
            {
                title: 'Території та доступність на карті',
                paragraphs: [
                    `Дашборд охоплює Україну, 26 територій обласного рівня та ${formatInteger(scope.hromada_payload_coverage.controlled_hromadas)} громади. Межі на карті доступні для ${formatInteger(scope.hromada_geometry_coverage.features_available)} громад; для ${formatInteger(scope.hromada_geometry_coverage.source_geometry_gaps)} громад у використаному картографічному джерелі немає геометрії.`,
                    'Відсутність геометрії впливає лише на карту. Аналітичне значення для громади може залишатися доступним у таблиці.',
                ],
            },
            {
                title: 'Що означають відсутні значення',
                definitions: [
                    ['0', 'Порівнюване охоплення є, а розрахований перетин справді дорівнює нулю.'],
                    ['Часткове охоплення', 'Результат можна розрахувати, але охоплено не весь очікуваний розрахунковий навчальний час або не всі складові території.'],
                    ['Не охоплено джерелом', 'Джерело тривог не вважається порівнюваним для цієї території в межах методології.'],
                    ['Недоступно', 'Результат неможливо розрахувати з іншої причини, пов’язаної з даними.'],
                    ['Геометрія на карті недоступна', 'Значення може існувати, але на карті немає геометрії громади.'],
                ],
            },
            {
                title: 'Завантаження даних',
                paragraphs: ['CSV формується для поточного набору порівняння та вибраного періоду. Він містить неокруглені значення, стабільні технічні назви полів англійською, а також відомості про охоплення і рівень оголошення тривоги.'],
            },
            {
                title: 'Технічна інформація про реліз',
                details: {
                    summary: 'Показати ідентифікатори, версії та контрольні суми',
                    definitions: [
                        ['Реліз сайту', release.website_release_id],
                        ['Аналітична збірка', release.analytical_build_id],
                        ['Commit джерела', release.analytical_source_upstream_commit_sha],
                        ['Git blob SHA-1', release.analytical_source_git_blob_sha1],
                        ['SHA-256 файлу джерела', release.analytical_source_sha256],
                        ['Версія методології', release.methodology_version],
                        ['Версія словника показників', release.indicator_dictionary_version],
                        ['Версія контракту вхідних даних', release.input_data_contract_version],
                        ['Версія припущень', release.assumptions_version],
                    ],
                },
            },
        ];
    }
    return [
        {
            title: 'Release at a glance',
            definitions: [
                ['Status', 'Final public release'],
                ['School years included', '2022/23–2025/26'],
                ['Air-alarm data through', coverageEnd],
            ],
        },
        {
            title: 'Air-alarm data',
            paragraphs: [
                `The dashboard uses the published official_data_uk.csv file from the Ukrainian Air Raid Sirens Dataset. Source coverage runs from ${coverageStart} through ${coverageEnd}. The file was retrieved and verified on ${retrieved}.`,
                'Even when the source contains records from July and August, school indicators remain restricted to modelled school hours and the September–June school-calendar months.',
            ],
            link: { href: release.source_url, label: 'Open the air-alarm data file used for this release', external: true },
        },
        {
            title: 'Education data',
            paragraphs: [
                'School and learner counts come from selected school-level education snapshots and describe the full included education network. Aggregate alarm measures use only the weight of active school locations with comparable alarm-source coverage.',
            ],
            table: { headers: ['School year', 'Snapshot used'], rows: SNAPSHOTS.map(([year, date]) => [year, formatDate(date)]) },
        },
        {
            title: 'Territories and map availability',
            paragraphs: [
                `The dashboard includes Ukraine, 26 oblast-level territories and ${formatInteger(scope.hromada_payload_coverage.controlled_hromadas)} hromadas. Map boundaries are available for ${formatInteger(scope.hromada_geometry_coverage.features_available)} hromadas; ${formatInteger(scope.hromada_geometry_coverage.source_geometry_gaps)} hromadas do not have map geometry in the source used by the site.`,
                'Missing map geometry affects the map only. An analytical value for the hromada may still be available in the table.',
            ],
        },
        {
            title: 'Missing-data semantics',
            definitions: [
                ['Zero', 'Comparable source coverage is available and the calculated overlap is genuinely zero.'],
                ['Partial coverage', 'A result can be calculated, but not all expected modelled school time or territory components have comparable coverage.'],
                ['Not covered by source', 'The alarm source is not considered comparable for the territory under this methodology.'],
                ['Unavailable', 'The result cannot be calculated for another data reason.'],
                ['Map geometry unavailable', 'A value may exist, but the map lacks a geometry for the hromada.'],
            ],
        },
        {
            title: 'Downloads',
            paragraphs: ['The comparison CSV reflects the current comparison set and selected period. Values are unrounded, technical field names remain stable and English, and coverage and alarm-reporting information are included.'],
        },
        {
            title: 'Technical release details',
            details: {
                summary: 'Show identifiers, versions and checksums',
                definitions: [
                    ['Website release', release.website_release_id],
                    ['Analytical build', release.analytical_build_id],
                    ['Source commit', release.analytical_source_upstream_commit_sha],
                    ['Git blob SHA-1', release.analytical_source_git_blob_sha1],
                    ['Source SHA-256', release.analytical_source_sha256],
                    ['Methodology version', release.methodology_version],
                    ['Indicator dictionary version', release.indicator_dictionary_version],
                    ['Input contract version', release.input_data_contract_version],
                    ['Assumptions version', release.assumptions_version],
                ],
            },
        },
    ];
}

function appendParagraphs(container, paragraphs = []) {
    for (const text of paragraphs) {
        const paragraph = document.createElement('p');
        paragraph.textContent = text;
        container.append(paragraph);
    }
}

function definitionList(items, className = '') {
    const list = document.createElement('dl');
    list.className = className;
    for (const [term, description] of items) {
        const item = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = term;
        dd.textContent = description;
        item.append(dt, dd);
        list.append(item);
    }
    return list;
}

function appendTable(container, spec) {
    const wrapper = document.createElement('div');
    wrapper.className = 'content-table-wrap';
    const table = document.createElement('table');
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const label of spec.headers) {
        const th = document.createElement('th');
        th.scope = 'col';
        th.textContent = label;
        headRow.append(th);
    }
    head.append(headRow);
    const body = document.createElement('tbody');
    for (const values of spec.rows) {
        const row = document.createElement('tr');
        values.forEach((value, index) => {
            const cell = document.createElement(index === 0 ? 'th' : 'td');
            if (index === 0)
                cell.scope = 'row';
            cell.textContent = value;
            row.append(cell);
        });
        body.append(row);
    }
    table.append(head, body);
    wrapper.append(table);
    container.append(wrapper);
}

function appendBlockContent(container, block) {
    appendParagraphs(container, block.paragraphs);
    if (block.callout) {
        const callout = document.createElement('p');
        callout.className = 'method-callout';
        callout.textContent = block.callout;
        container.append(callout);
    }
    if (block.bullets) {
        const list = document.createElement('ul');
        for (const text of block.bullets) {
            const item = document.createElement('li');
            item.textContent = text;
            list.append(item);
        }
        container.append(list);
    }
    if (block.definitions)
        container.append(definitionList(block.definitions, 'content-definitions'));
    if (block.indicators) {
        const list = document.createElement('div');
        list.className = 'indicator-definitions';
        for (const indicator of block.indicators) {
            const article = document.createElement('article');
            const heading = document.createElement('h3');
            heading.textContent = indicator.title;
            article.append(heading, definitionList(indicator.definitions));
            if (indicator.note)
                appendParagraphs(article, [indicator.note]);
            list.append(article);
        }
        container.append(list);
    }
    if (block.subsections) {
        for (const subsection of block.subsections) {
            const section = document.createElement('section');
            section.className = 'method-subsection';
            const heading = document.createElement('h3');
            heading.textContent = subsection.title;
            section.append(heading);
            appendBlockContent(section, subsection);
            container.append(section);
        }
    }
    if (block.table)
        appendTable(container, block.table);
    if (block.link) {
        const link = document.createElement('a');
        link.href = block.link.href;
        link.textContent = block.link.label;
        if (block.link.external) {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        }
        container.append(link);
    }
    if (block.details) {
        const details = document.createElement('details');
        details.className = 'technical-release-details';
        const summary = document.createElement('summary');
        summary.textContent = block.details.summary;
        details.append(summary, definitionList(block.details.definitions, 'content-definitions technical-definitions'));
        container.append(details);
    }
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
        const content = document.createElement('div');
        content.className = 'prose';
        const heading = document.createElement('h2');
        heading.textContent = block.title;
        content.append(heading);
        appendBlockContent(content, block);
        section.append(sectionIndex, content);
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
