const status = document.getElementById('load-status');

async function loadResults() {
  const response = await fetch('./data/visual-sensitivity.json');
  if (!response.ok) throw new Error(`Could not load measurement data (${response.status}).`);
  const data = await response.json();
  render(data);
}

function render(data) {
  status.hidden = true;
  const meta = data.study;
  document.getElementById('visual-rationale').textContent = 'The measurement data will populate this explanation.';
  document.getElementById('study-settings').innerHTML = '';
  document.getElementById('hero-stats').innerHTML = '';
  document.getElementById('outcome-stats').innerHTML = '';
}

loadResults().catch((error) => {
  status.textContent = `Study data could not be loaded: ${error.message}`;
});

const rail = document.getElementById('rail');
const links = [...rail.querySelectorAll('a')];
const sections = links.map((link) => document.querySelector(link.getAttribute('href'))).filter(Boolean);

function updateRail() {
  const current = sections.filter((section) => section.getBoundingClientRect().top <= innerHeight * 0.3).at(-1);
  links.forEach((link) => {
    const active = current && link.hash === `#${current.id}`;
    if (active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
  const activeLink = links.find((link) => link.hasAttribute('aria-current'));
  if (!activeLink) return;
  const railBox = rail.getBoundingClientRect();
  const linkBox = activeLink.getBoundingClientRect();
  const indicator = rail.querySelector('.indicator');
  if (innerWidth < 800) {
    rail.style.setProperty('--indicator-x', `${linkBox.left - railBox.left}px`);
    rail.style.setProperty('--indicator-width', `${linkBox.width}px`);
  } else {
    rail.style.setProperty('--indicator-y', `${activeLink.offsetTop - 8}px`);
  }
}
document.addEventListener('scroll', updateRail, { passive: true });
window.addEventListener('resize', updateRail);
updateRail();
