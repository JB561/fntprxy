(() => {
  const grid = document.querySelector('#games-grid');
  const status = document.querySelector('#games-status');
  const search = document.querySelector('#games-search');
  const refresh = document.querySelector('#games-refresh');
  const player = document.querySelector('#game-player');
  const frame = document.querySelector('#game-frame');
  const title = document.querySelector('#game-player-title');
  const stop = document.querySelector('#game-stop');
  let games = [];
  let activeGame = null;

  const escapeHtml = (value) => String(value).replace(/[&<>\"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[char]));
  const render = () => {
    const query = search.value.trim().toLowerCase();
    const filtered = games.filter((game) => `${game.title} ${game.category}`.toLowerCase().includes(query));
    grid.innerHTML = filtered.length ? filtered.map((game) => `<article class="game-card"><div class="game-card-art" aria-hidden="true">${escapeHtml(game.icon || 'PLAY')}</div><div class="game-card-body"><p class="game-category">${escapeHtml(game.category || 'Game')}</p><h2>${escapeHtml(game.title)}</h2><p>${escapeHtml(game.description || 'Ready to play.')}</p><button type="button" data-game-id="${escapeHtml(game.id)}">Play now</button></div></article>`).join('') : '<p class="games-empty">No games matched your search.</p>';
  };
  const load = async () => {
    status.textContent = 'Loading game library…';
    try {
      const response = await fetch('/api/games/catalog', { cache: 'no-store' });
      if (!response.ok) throw new Error('Catalog unavailable');
      games = await response.json();
      render();
      status.textContent = `${games.length} games available`;
    } catch (error) {
      status.textContent = 'The Stratus game library is unavailable right now.';
      grid.innerHTML = '<p class="games-empty">Start the local Stratus service and refresh this page.</p>';
    }
  };
  const play = async (game) => {
    status.textContent = `Starting ${game.title}…`;
    const response = await fetch('/api/games/play', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ gameId: game.id }) });
    if (!response.ok) throw new Error('Game could not be started');
    const session = await response.json();
    activeGame = session.sessionId;
    title.textContent = game.title;
    frame.src = session.url;
    player.hidden = false;
    player.scrollIntoView({ behavior: 'smooth', block: 'start' });
    status.textContent = `${game.title} is running`;
  };
  grid.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-game-id]');
    if (!button) return;
    const game = games.find((item) => item.id === button.dataset.gameId);
    if (!game) return;
    try { await play(game); } catch { status.textContent = 'Could not start that game.'; }
  });
  stop.addEventListener('click', async () => {
    if (activeGame) await fetch('/api/games/stop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: activeGame }) });
    activeGame = null; frame.src = 'about:blank'; player.hidden = true; status.textContent = 'Game stopped';
  });
  search.addEventListener('input', render);
  refresh.addEventListener('click', load);
  load();
})();
