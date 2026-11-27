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
  const photographerNote = document.querySelector('#photographer-note');
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
  let audioContext = null;
  let joinedEdges = new Set();
  let wasWon = false;

  const svgNamespace = 'http://www.w3.org/2000/svg';
  const pieceWidth = 3;
  const pieceHeight = 4;
  const imageUrl = getComputedStyle(board).getPropertyValue('--puzzle-image').trim();
  const photoUrl = imageUrl.match(/^url\((['"]?)(.*?)\1\)$/)?.[2];
  const svg = svgElement('svg', { class: 'puzzle-art', 'aria-hidden': 'true', focusable: 'false',
    preserveAspectRatio: 'none' });
  const definitions = svgElement('defs');
  const photo = svgElement('image', { id: 'puzzle-photo', href: photoUrl, preserveAspectRatio: 'none' });
  svg.append(definitions);
  let drawings = [];

  function playNotes(notes) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      audioContext ||= new AudioContext();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      const now = audioContext.currentTime + .02;
      notes.forEach(({ frequency, delay, duration, volume = .06 }) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const start = now + delay;
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(.001, start);
        gain.gain.linearRampToValueAtTime(volume, start + .012);
        gain.gain.exponentialRampToValueAtTime(.001, start + duration);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(start);
        oscillator.stop(start + duration + .02);
      });
    } catch (_) { /* Sound is optional when the browser blocks Web Audio. */ }
  }

  function playJoinClick() {
    playNotes([
      { frequency: 1480, delay: 0, duration: .045, volume: .09 },
      { frequency: 920, delay: .025, duration: .065, volume: .07 },
    ]);
  }

  function playFanfare() {
    playNotes([
      { frequency: 523, delay: 0, duration: .22, volume: .075 },
      { frequency: 659, delay: .16, duration: .22, volume: .075 },
      { frequency: 784, delay: .32, duration: .28, volume: .08 },
      { frequency: 659, delay: .53, duration: .62, volume: .05 },
      { frequency: 784, delay: .53, duration: .62, volume: .05 },
      { frequency: 1047, delay: .53, duration: .72, volume: .075 },
    ]);
  }

  function svgElement(tag, attributes = {}) {
    const element = document.createElementNS(svgNamespace, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    return element;
  }

  function edgePoints(seed, straight) {
    if (straight) return [[0, 0], [1, 0]];
    const polarity = (seed >>> 10) % 2 === 0 ? 1 : -1;
    const depth = (.20 + (seed >>> 17) % 15 / 100) * polarity;
    const shift = ((seed >>> 3) % 13 - 6) / 100;
    return [
      [0, 0], [.12, ((seed >>> 5) % 5 - 2) / 100], [.24, depth * .18],
      [.31 + shift, depth * .28], [.35 + shift, -depth * .29],
      [.45 + shift, depth * .69], [.48 + shift, depth],
      [.55 + shift, depth * .53], [.57 + shift, depth * .79],
      [.63 + shift, -depth * .38], [.70 + shift, -depth * .70],
      [.75 + shift, -depth * .15], [.86, depth * .12], [1, 0],
    ];
  }

  function piecePath(column, row) {
    // The two pieces sharing an edge calculate the same cut in opposite directions.
    const edges = [
      [column, row, false, false],
      [column + 1, row, true, false],
      [column, row + 1, false, true],
      [column, row, true, true],
    ];
    const commands = edges.flatMap(([x, y, vertical, reverse]) => {
      const coordinate = vertical ? x : y;
      const seed = Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)
        ^ Math.imul(x + y + (vertical ? 17 : 3), 83492791);
      const points = edgePoints(seed, coordinate === 0 || coordinate === n);
      if (reverse) points.reverse();
      return points.slice(1).map(([along, across]) => {
        const px = (x - column + (vertical ? across : along)) * pieceWidth;
        const py = (y - row + (vertical ? along : across)) * pieceHeight;
        return `L${px} ${py}`;
      });
    });
    return ['M0 0', ...commands, 'Z'].join(' ');
  }

  function prepareArtwork() {
    if (!photoUrl) return;
    board.classList.add('curved');
    board.append(svg);
    svg.setAttribute('viewBox', `0 0 ${n * pieceWidth} ${n * pieceHeight}`);
    photo.setAttribute('width', n * pieceWidth);
    photo.setAttribute('height', n * pieceHeight);
    const contours = tiles.map((_, piece) => {
      const column = piece % n;
      const row = Math.floor(piece / n);
      return svgElement('path', { id: `puzzle-shape-${piece}`, d: piecePath(column, row),
        'vector-effect': 'non-scaling-stroke' });
    });
    const clips = contours.map((contour, piece) => {
      const clip = svgElement('clipPath', { id: `puzzle-clip-${piece}` });
      clip.append(svgElement('use', { href: `#${contour.id}` }));
      return clip;
    });
    definitions.replaceChildren(photo, ...contours, ...clips);
    drawings = tiles.map(() => {
      const group = svgElement('g');
      const imageCrop = svgElement('g', { class: 'puzzle-piece-image' });
      const image = svgElement('use', { href: '#puzzle-photo' });
      const outline = svgElement('use', { class: 'puzzle-outline' });
      imageCrop.append(image);
      group.append(imageCrop, outline);
      return { group, imageCrop, image, outline };
    });
    svg.replaceChildren(definitions, ...drawings.map(({ group }) => group));
  }

  function drawArtwork(won) {
    if (!photoUrl) return;
    board.classList.toggle('solved', won);
    drawings.forEach(({ group, imageCrop, image, outline }, position) => {
      const { piece, turns } = layout[position];
      // All pieces share one scale; the inset leaves space between fragments.
      const zoom = won ? 1 : 0.8;
      const centerX = (position % n + .5) * pieceWidth;
      const centerY = (Math.floor(position / n) + .5) * pieceHeight;
      group.setAttribute('transform', `translate(${centerX} ${centerY}) rotate(${90 * turns}) scale(${zoom}) translate(${-pieceWidth / 2} ${-pieceHeight / 2})`);
      group.classList.toggle('selected', position === selected);
      imageCrop.setAttribute('clip-path', `url(#puzzle-clip-${piece})`);
      image.setAttribute('x', -(piece % n) * pieceWidth);
      image.setAttribute('y', -Math.floor(piece / n) * pieceHeight);
      outline.setAttribute('href', `#puzzle-shape-${piece}`);
    });
  }

  function isCorrect(position) {
    return layout[position].piece === position && layout[position].turns === 0;
  }

  function render(userMove = false) {
    const correctEdges = new Set();
    for (let position = 0; position < layout.length; position++) {
      if (!isCorrect(position)) continue;
      const column = position % n;
      if (column < n - 1 && isCorrect(position + 1)) correctEdges.add(`${position}-${position + 1}`);
      if (position + n < layout.length && isCorrect(position + n)) correctEdges.add(`${position}-${position + n}`);
    }
    const newJoin = [...correctEdges].some(edge => !joinedEdges.has(edge));
    tiles.forEach((tile, position) => {
      const { piece, turns } = layout[position];
      const column = piece % n;
      const row = Math.floor(piece / n);
      tile.dataset.piece = piece;
      tile.dataset.position = position;
      tile.dataset.turns = turns;
      tile.firstElementChild.style.backgroundPosition = `${column * 100 / (n - 1)}% ${row * 100 / (n - 1)}%`;
      tile.classList.toggle('selected', selected === position);
      tile.disabled = false;
      tile.setAttribute('aria-pressed', String(selected === position));
    });
    const correct = layout.filter(({ piece, turns }, position) => piece === position && turns === 0).length;
    const won = correct === layout.length;
    if (userMove && newJoin) playJoinClick();
    if (won && !wasWon) playFanfare();
    wasWon = won;
    joinedEdges = correctEdges;
    drawArtwork(won);
    progress.textContent = `${correct} / ${layout.length}`;
    movesLabel.textContent = moves;
    rotateButton.disabled = selected < 0;
    message.classList.toggle('win', won);
    photographerNote.hidden = !won;
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
    render(true);
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
    prepareArtwork();
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
    render(true);
  });
  prepareArtwork();
  render();
  [size, shuffleButton, resetButton, hint].forEach(control => { control.disabled = false; });
  const game = document.querySelector('#game');
  game.querySelectorAll('[hidden]:not(#photographer-note)').forEach(element => { element.hidden = false; });
  game.setAttribute('data-ready', '');
})();
