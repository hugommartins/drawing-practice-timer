const status = document.getElementById('load-status');

async function loadStudy() {
  const [visual, ui, reconstructed, uiReconstructed, editorial] = await Promise.all([
    fetch('./data/visual-sensitivity.json').then(readJson),
    fetch('./data/ui-vs-faults.json').then(readJson),
    fetch('./data/visual-real.json').then(readJson),
    fetch('./data/ui-real.json').then(readJson),
    fetch('./data/editorial.json').then(readJson),
  ]);
  renderStudy(visual, ui, reconstructed, uiReconstructed, editorial);
}

async function readJson(response) {
  if (!response.ok) throw new Error(`Could not load study data (${response.status}).`);
  return response.json();
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function range(values) {
  const numbers = values.flat();
  return { min: Math.min(...numbers), max: Math.max(...numbers) };
}

function fmt(n) {
  return new Intl.NumberFormat('en').format(n);
}

function visualCount(visual, setting) {
  return visual.faults.filter((fault) => fault.caughtEveryScreen[setting]).length;
}

function reconstructionCount(visual, setting) {
  return visual.faults.filter((fault) => fault.caughtEveryScreen[setting]).length;
}

function uiFailures(ui) {
  return ui.faults.filter((fault) => fault.ui.failed > 0).length;
}

function allDiffs(fault, setting) {
  return Object.values(fault.screens).filter((screen) => {
    if (setting === 'default') return screen.default.flagged;
    if (setting === 'local') return screen.strict.localFlagged;
    if (setting === 'ci') return screen.strict.ciFlagged;
    return screen.strict.unlimitedFlagged;
  }).length;
}

function settingTable(visual, ui, reconstructed, reconstructedUi) {
  const headings = ['Setting', `${visual.faults.length} injected`, `${reconstructedUi.faults.length} real commits`];
  const rows = [
    ['UI tests', `${uiFailures(ui)}/${ui.faults.length}`, `${uiFailures(reconstructedUi)}/${reconstructedUi.faults.length}`],
    [`Default (${visual.study.thresholds[0]})`, `${visualCount(visual, 'default')}/${visual.faults.length}`, `${reconstructionCount(reconstructed, 'default')}/${reconstructed.faults.length}`],
    [`Local budget (${fmt(visual.study.budgets.local)} px)`, `${visualCount(visual, 'local')}/${visual.faults.length}`, `${reconstructionCount(reconstructed, 'local')}/${reconstructed.faults.length}`],
    [`CI budget (${fmt(visual.study.budgets.ci)} px)`, `${visualCount(visual, 'ci')}/${visual.faults.length}`, `${reconstructionCount(reconstructed, 'ci')}/${reconstructed.faults.length}`],
    [`Strict (${visual.study.thresholds[1]}, no budget)`, `${visualCount(visual, 'strict')}/${visual.faults.length}`, `${reconstructionCount(reconstructed, 'strict')}/${reconstructed.faults.length}`],
  ];
  return table(headings, rows);
}

function table(headings, rows) {
  const result = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const heading of headings) {
    const th = node('th', '', heading);
    th.scope = 'col';
    headRow.append(th);
  }
  thead.append(headRow);
  result.append(thead);
  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    row.forEach((value, index) => {
      const cell = node(index === 0 ? 'th' : 'td');
      if (value instanceof Node) cell.append(value); else cell.textContent = value;
      if (index === 0) cell.scope = 'row';
      tr.append(cell);
    });
    tbody.append(tr);
  }
  result.append(tbody);
  return result;
}

function addDlRow(dl, term, detail) {
  const item = document.createElement('div');
  const dt = node('dt', '', term);
  const dd = node('dd', '', detail);
  item.append(dt, dd);
  dl.append(item);
}

function stat(value, label) {
  const li = node('li', 'stat');
  li.append(node('p', 'num', value), node('p', 'label', label));
  return li;
}

function commitLabel(fault, base) {
  const wrap = document.createDocumentFragment();
  wrap.append(node('span', '', fault.name), document.createElement('br'));
  const link = node('a', '', fault.commit);
  link.href = `${base}${fault.commit}`;
  link.title = fault.commitSubject;
  wrap.append(link);
  return wrap;
}

function renderReconstructedTable(visual, uiReconstructed) {
  const rows = visual.faults.map((fault) => {
    const matchingUi = uiReconstructed.faults.find((result) => result.id === fault.id);
    const uiStatus = matchingUi?.ui.failed ? 'yes' : 'none';
    const total = fault.drawnOn.length;
    const cell = (setting) => {
      const caught = allDiffs(fault, setting);
      if (caught === 0) return 'none';
      if (caught === total) return 'all';
      if (total === 1) return 'yes';
      return `${caught} of ${total}`;
    };
    return [commitLabel(fault, visual.study.repoCommitUrl), uiStatus, cell('default'), cell('local'), cell('ci'), cell('strict')];
  });
  return table(['Real commit', 'UI', 'Default', 'Local', 'CI', 'Strict'], rows);
}

function renderFaultMatrix(visual, ui, reconstructed, uiReconstructed) {
  const allVisualFaults = [...visual.faults, ...reconstructed.faults];
  const allUiFaults = [...ui.faults, ...uiReconstructed.faults];
  const headings = [
    'Fault',
    'Type',
    'UI tests fail?',
    ...visual.study.screens.flatMap((screen) => [
      `${screen} · default`,
      `${screen} · local`,
      `${screen} · CI`,
      `${screen} · strict`,
    ]),
  ];
  const rows = allVisualFaults.map((fault) => {
    const uiFault = allUiFaults.find((entry) => entry.id === fault.id);
    const cells = visual.study.screens.flatMap((screen) => {
      const outcome = fault.screens[screen];
      if (!outcome) return ['—', '—', '—', '—'];
      return [
        outcome.default.flagged ? '●' : '○',
        outcome.strict.localFlagged ? '●' : '○',
        outcome.strict.ciFlagged ? '●' : '○',
        outcome.strict.unlimitedFlagged ? '●' : '○',
      ];
    });
    return [fault.name, fault.kind, uiFault?.ui.failed ? 'yes' : 'no', ...cells];
  });
  const result = table(headings, rows);
  result.setAttribute('aria-describedby', 'matrix-help');
  return result;
}

function renderStudy(visual, ui, reconstructed, uiReconstructed, editorial) {
  status.hidden = true;
  const repeat = range(Object.values(visual.noise.sameMachine));
  const proxy = range(Object.values(visual.noise.environmentProxy));
  const proxyMinMultiple = Math.round(proxy.min / visual.study.budgets.ci);
  const proxyMaxMultiple = Math.round(proxy.max / visual.study.budgets.ci);
  const strictCount = visualCount(visual, 'strict');
  const radius = visual.faults.find((fault) => fault.id === 'card-radius');
  const radiusPixels = radius?.screens.Practice.strict.diffPixels ?? 0;
  const smallColorFaults = visual.faults.filter((fault) => fault.rgbDelta >= 2 && fault.rgbDelta <= 4);
  const lightAccent = visual.faults.find((fault) => fault.id === 'light-accent-subtle');
  const passedVisual = ui.faults.filter((fault) => fault.ui.failed === 0).length;
  const controlFailed = ui.controls.some((fault) => fault.id === 'hide-navigation' && fault.ui.failed > 0);

  const provenance = document.getElementById('reconstruction-note');
  if (reconstructed.study.sourceNote) {
    provenance.textContent = reconstructed.study.sourceNote;
    provenance.hidden = false;
  }

  document.getElementById('study-lede').textContent = editorial.lede;
  document.getElementById('context-copy').textContent = editorial.context;
  document.getElementById('outcome-copy').textContent = editorial.outcome;

  document.getElementById('visual-rationale').textContent =
    `Across ${visual.faults.length} injected visual changes, ${passedVisual} suites passed all ${ui.study.expectedTestCount} UI tests. ` +
    `${controlFailed ? 'The hide-navigation control failed the UI suite, confirming the functional checks can detect a broken interaction.' : ''} ` +
    editorial.whyLayer;

  const dl = document.getElementById('study-settings');
  addDlRow(dl, 'Screens', visual.study.screens.join(', '));
  addDlRow(dl, 'Capture size', `${visual.study.viewport.width} × ${visual.study.viewport.height} CSS px; device scale ${visual.study.viewport.deviceScaleFactor}`);
  addDlRow(dl, 'Repeat renders', `${visual.study.repeatCount} per screen`);
  addDlRow(dl, 'Comparison', `${visual.study.comparator}; thresholds ${visual.study.thresholds.join(' and ')}`);
  addDlRow(dl, 'Pixel budgets', `${fmt(visual.study.budgets.local)} local; ${fmt(visual.study.budgets.ci)} CI`);
  addDlRow(dl, 'Environment proxy', visual.study.environmentProxy);
  addDlRow(dl, 'Count rule', visual.study.countRule);

  const hero = document.getElementById('hero-stats');
  hero.append(
    stat(`${uiFailures(ui)} of ${ui.faults.length}`, 'visual-fault UI suites that failed'),
    stat(`${strictCount} of ${visual.faults.length}`, `faults caught on every screen at ${visual.study.thresholds[1]} with no pixel budget`),
    stat(`${fmt(repeat.max)} px`, 'maximum same-machine repeat variation'),
    stat(`${fmt(proxy.min)}–${fmt(proxy.max)} px`, 'per-screen environment-proxy variation'),
  );

  const outcomeStats = document.getElementById('outcome-stats');
  outcomeStats.append(
    stat(`${passedVisual} of ${ui.faults.length}`, `visual-fault suites passing all ${ui.study.expectedTestCount} UI tests`),
    stat(`${visualCount(visual, 'local')} / ${visualCount(visual, 'ci')} / ${strictCount}`, 'faults caught on all drawn screens: local budget / CI budget / strict with no budget'),
    stat(`${fmt(repeat.max)} px`, `maximum change across ${visual.study.repeatCount} repeats per screen on one machine`),
  );

  const radiusName = radius?.name ?? '';
  const radiusNumbers = radiusName.match(/\d+/g) ?? [];
  document.getElementById('corner-before-caption').textContent = `Before: ${radiusNumbers[0] ?? '—'} px radius`;
  document.getElementById('corner-after-caption').textContent = `After: ${radiusNumbers[1] ?? '—'} px radius`;
  document.getElementById('corner-caption').textContent =
    `Schematic of the measured Practice-screen radius change. The strict comparison reported ${fmt(radiusPixels)} changed pixels on that screen; UI-test and screenshot results are in the tables below.`;

  document.getElementById('setting-results').append(settingTable(visual, ui, reconstructed, uiReconstructed));
  document.getElementById('reconstructed-results').append(renderReconstructedTable(reconstructed, uiReconstructed));
  document.getElementById('matrix-summary').textContent =
    `Show the full fault-by-screen matrix (${visual.faults.length + reconstructed.faults.length} faults)`;
  document.getElementById('matrix-help')?.remove();
  const help = node('p', 'sr-only', 'Filled dots mean flagged; open dots mean missed; a dash means the fault is not drawn on that screen.');
  help.id = 'matrix-help';
  document.getElementById('fault-matrix').append(help, renderFaultMatrix(visual, ui, reconstructed, uiReconstructed));

  const findings = document.getElementById('findings');
  const lowDeltaMisses = smallColorFaults.every((fault) => Object.values(fault.screens).every((screen) => screen.strict.diffPixels === 0));
  findings.append(
    finding(`Same-machine noise measured ${fmt(repeat.min)}–${fmt(repeat.max)} px across the captured repeats.`),
    finding(`The environment proxy measured ${fmt(proxy.min)}–${fmt(proxy.max)} px per screen—about ${proxyMinMultiple}–${proxyMaxMultiple}× the CI budget. It is a same-machine rendering proxy, not a macOS/CI comparison.`),
    finding(`${lowDeltaMisses ? 'Color' : 'Some color'} changes of ${Math.min(...smallColorFaults.map((fault) => fault.rgbDelta))}–${Math.max(...smallColorFaults.map((fault) => fault.rgbDelta))} RGB units ${lowDeltaMisses ? 'were invisible' : 'were not all invisible'} at ${visual.study.thresholds[1]}.`),
    finding(`At the default ${visual.study.thresholds[0]} threshold, the light-accent change was missed on all ${lightAccent?.drawnOn.length ?? 0} drawn screens.`),
  );

  renderOrdered(editorial.stages, 'stage-list', true);
  renderLearning(editorial.learning);
  renderNextSteps(editorial.nextSteps, editorial.unknowns);
  updateRail();
}

function finding(text) {
  return node('li', '', text);
}

function renderOrdered(items, id, numbered = false) {
  const list = document.getElementById(id);
  for (const item of items) {
    const li = document.createElement('li');
    li.append(node('h3', '', item.title), node('p', '', item.body));
    list.append(li);
  }
  if (!numbered) list.setAttribute('role', 'list');
}

function renderLearning(items) {
  const list = document.getElementById('learning-list');
  for (const item of items) {
    const li = document.createElement('li');
    li.append(node('h3', '', item.title), node('p', '', item.body));
    list.append(li);
  }
}

function renderNextSteps(items, unknowns) {
  const list = document.getElementById('next-list');
  for (const item of items) {
    const li = document.createElement('li');
    li.append(node('strong', '', item.title), node('p', '', item.body));
    list.append(li);
  }
  const unknown = document.createElement('li');
  unknown.append(node('strong', '', 'Not measured:'), node('p', '', unknowns.join('; ') + '.'));
  list.append(unknown);
}

loadStudy().catch((error) => {
  status.textContent = `Study data could not be loaded: ${error.message}`;
});

const rail = document.getElementById('rail');
const links = [...rail.querySelectorAll('a')];
const sections = links.map((link) => document.querySelector(link.getAttribute('href'))).filter(Boolean);

function updateRail() {
  const current = sections.filter((section) => section.getBoundingClientRect().top <= innerHeight * 0.3).at(-1);
  links.forEach((link) => {
    if (current && link.hash === `#${current.id}`) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
  const active = links.find((link) => link.hasAttribute('aria-current'));
  if (!active) return;
  const railRect = rail.getBoundingClientRect();
  const linkRect = active.getBoundingClientRect();
  if (innerWidth < 800) {
    rail.style.setProperty('--indicator-x', `${linkRect.left - railRect.left}px`);
    rail.style.setProperty('--indicator-width', `${linkRect.width}px`);
  } else {
    rail.style.setProperty('--indicator-y', `${active.offsetTop - 8}px`);
  }
}

document.addEventListener('scroll', updateRail, { passive: true });
window.addEventListener('resize', updateRail);
updateRail();
