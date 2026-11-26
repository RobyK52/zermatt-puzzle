(() => {
  const board = document.querySelector('#board');
  const size = document.querySelector('#size');
  const shuffleButton = document.querySelector('#shuffle');
  const resetButton = document.querySelector('#reset');
  const hint = document.querySelector('#hint');
  const rotateButton = document.querySelector('#rotate');
  const progress = document.querySelector('#progress');
  const movesLabel = document.querySelector('#moves');
  const message = document.querySelector('#message');
  let tiles = Array.from(board.children);
  let n = Number(size.value);
  let startingLayout = tiles.map(tile => ({
    piece: Number(tile.dataset.piece),
    turns: Number(tile.dataset.turns),
  }));
  let layout = startingLayout.map(tile => ({ ...tile }));
  let selected = -1;
  let canSwapSelection = false;
  let moves = 0;
  let gesture = null;
  let ignorePointerClick = false;

  function render() {
    tiles.forEach((tile, position) => {
      const { piece, turns } = layout[position];
      const column = piece % n;
      const row = Math.floor(piece / n);
      tile.dataset.piece = piece;
      tile.dataset.position = position;
      tile.dataset.turns = turns;
      tile.firstElementChild.style.backgroundPosition = `${column * 100 / (n - 1)}% ${row * 100 / (n - 1)}%`;
      tile.classList.toggle('selected', selected === position);
      tile.setAttribute('aria-pressed', String(selected === position));
    });
    const correct = layout.filter(({ piece, turns }, position) => piece === position && turns === 0).length;
    const won = correct === layout.length;
    progress.textContent = `${correct} / ${layout.length}`;
    movesLabel.textContent = moves;
    rotateButton.disabled = selected < 0;
    message.classList.toggle('win', won);
    if (won) message.textContent = 'Geschafft! Das Bild ist wieder zusammengesetzt.';
    else if (canSwapSelection) message.textContent = 'Stein ausgewählt. Drehe ihn oder tippe auf einen zweiten Stein.';
    else if (selected >= 0) message.textContent = 'Drehe weiter oder wähle einen Stein neu aus.';
    else message.textContent = 'Tippe einen Stein an.';
  }

  function setHint(visible) {
    board.classList.toggle('hint', visible);
    hint.setAttribute('aria-pressed', String(visible));
    hint.textContent = visible ? 'Vorschaubild aus' : 'Vorschaubild';
  }

  function restart() {
    selected = -1;
    canSwapSelection = false;
    moves = 0;
    layout = startingLayout.map(tile => ({ ...tile }));
    setHint(false);
    render();
  }

  function shuffle() {
    startingLayout = Array.from({ length: n * n }, (_, piece) => ({
      piece,
      turns: Math.floor(Math.random() * 4),
    }));
    for (let i = startingLayout.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [startingLayout[i], startingLayout[j]] = [startingLayout[j], startingLayout[i]];
    }
    if (startingLayout.every(({ piece }, position) => piece === position)) {
      [startingLayout[0], startingLayout[1]] = [startingLayout[1], startingLayout[0]];
    }
    if (startingLayout.every(({ turns }) => turns === 0)) {
      startingLayout[0].turns = 1;
    }
    restart();
  }

  function swap(first, second) {
    [layout[first], layout[second]] = [layout[second], layout[first]];
    moves++;
    selected = -1;
    canSwapSelection = false;
    render();
  }

  function activate(position) {
    if (canSwapSelection && selected !== position) {
      swap(selected, position);
    } else {
      selected = canSwapSelection && selected === position ? -1 : position;
      canSwapSelection = selected >= 0;
      render();
    }
  }

  board.addEventListener('click', event => {
    const tile = event.target.closest('.tile');
    if (tile && !(event.detail && ignorePointerClick)) activate(Number(tile.dataset.position));
    ignorePointerClick = false;
  });
  board.addEventListener('pointerdown', event => {
    ignorePointerClick = false;
    const tile = event.target.closest('.tile');
    if (!tile || event.pointerType !== 'mouse' || event.button !== 0) return;
    gesture = { id: event.pointerId, tile, x: event.clientX, y: event.clientY };
  });
  window.addEventListener('pointerup', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const { x, y, tile } = gesture;
    gesture = null;
    if (Math.hypot(event.clientX - x, event.clientY - y) <= 9) return;
    ignorePointerClick = true;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.tile');
    if (target && target !== tile && board.contains(target)) {
      swap(Number(tile.dataset.position), Number(target.dataset.position));
    }
  });
  window.addEventListener('pointercancel', () => { gesture = null; });

  size.addEventListener('change', () => {
    n = Number(size.value);
    board.style.setProperty('--n', n);
    board.style.setProperty('--zoom', `${n * 100}%`);
    tiles = Array.from({ length: n * n }, (_, i) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'tile';
      tile.setAttribute('aria-label', `Bildfeld an Position ${i + 1}`);
      const photo = document.createElement('span');
      photo.className = 'tile-photo';
      photo.setAttribute('aria-hidden', 'true');
      tile.appendChild(photo);
      return tile;
    });
    board.replaceChildren(...tiles);
    shuffle();
  });

  shuffleButton.addEventListener('click', shuffle);
  resetButton.addEventListener('click', restart);
  hint.addEventListener('click', () => setHint(!board.classList.contains('hint')));
  rotateButton.addEventListener('click', () => {
    if (selected < 0) return;
    const tile = layout[selected];
    tile.turns = (tile.turns + 1) % 4;
    canSwapSelection = false;
    moves++;
    render();
  });
  render();
  [...tiles, size, shuffleButton, resetButton, hint].forEach(control => { control.disabled = false; });
  const game = document.querySelector('#game');
  game.querySelectorAll('[hidden]').forEach(element => { element.hidden = false; });
  game.setAttribute('data-ready', '');
})();
