import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import './styles.css';

const AUDIO_EXTENSIONS = ['mp3', 'flac', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'aiff', 'ape', 'wma'];
const saved = JSON.parse(localStorage.getItem('blindwave-settings') || '{}');

const state = {
  screen: 'setup',
  fileA: null,
  fileB: null,
  trials: Number.isInteger(saved.trials) ? saved.trials : 5,
  volume: Number.isInteger(saved.volume) ? saved.volume : 65,
  replayGain: saved.replayGain === true,
  albumGain: saved.albumGain === true,
  ffplayPath: saved.ffplayPath || '',
  ffplay: { available: false, executable: '' },
  currentTrial: 0,
  choices: [],
  playing: null,
  error: '',
};

const app = document.querySelector('#app');

function filename(path) {
  return path?.split(/[\\/]/).pop() || 'Choose a music file';
}

function saveSettings() {
  localStorage.setItem('blindwave-settings', JSON.stringify({
    trials: state.trials,
    volume: state.volume,
    replayGain: state.replayGain,
    albumGain: state.albumGain,
    ffplayPath: state.ffplayPath,
  }));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character]));
}

function icon(name) {
  const icons = {
    wave: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h2.2l1.7-6 3.2 12 2.5-9 1.7 6H21"/></svg>',
    folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.8A1.8 1.8 0 0 1 4.8 5h5l2 2H19.2A1.8 1.8 0 0 1 21 8.8v8.4a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 17.2V6.8Z"/><path d="M3.2 9h17.6"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none"/></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" stroke="none"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13m-5-5 5 5-5 5"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.8-4L3 10m0 0V5m0 5h5M4 13a8 8 0 0 0 14.8 4L21 14m0 0v5m0-5h-5"/></svg>',
    settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"/><path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.8 1.2v.3a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.8-1.2l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1A1.7 1.7 0 0 0 4.4 12a1.7 1.7 0 0 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.8l-.1-.1a1.7 1.7 0 1 1 2.4-2.4l.1.1A1.7 1.7 0 0 0 11 4.6v-.2a1.7 1.7 0 0 1 3.4 0v.2a1.7 1.7 0 0 0 2.8 1.2l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.8h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.4.6Z"/></svg>',
    volume: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h3l4 3V7L7 10H4Z"/><path d="M15 9.2a4 4 0 0 1 0 5.6M17.5 6.8a7.5 7.5 0 0 1 0 10.4"/></svg>',
  };
  return icons[name] || '';
}


function header() {
  return `<header class="topbar">
    <div class="brand"><span class="brand-mark">${icon('wave')}</span><span>blindwave</span></div>
    <div class="header-note"><span class="status-pip ${state.ffplay.available ? 'online' : ''}"></span> FFmpeg ${state.ffplay.available ? 'ready' : 'not found'}</div>
  </header>`;
}

function fileCard(slot, path, label) {
  const name = filename(path);
  return `<button type="button" class="file-drop ${path ? 'filled' : ''}" data-slot="${slot}">
    <span class="file-card-top"><span class="sample-tag">${label}</span><span class="file-type">${path ? name.split('.').pop().toUpperCase() : 'AUDIO'}</span></span>
    <span class="file-placeholder ${path ? 'has-file' : ''}">
      <span class="upload-icon">${path ? icon('check') : icon('folder')}</span>
      <span class="file-name" ${path ? `title="${escapeHtml(path)}"` : ''}>${path ? escapeHtml(name) : 'Drop a file here'}</span>
      <span class="file-path">${path ? 'Click to replace' : 'or click to choose'}</span>
    </span>
  </button>`;
}

function toggleSetting(id, label, description, checked, disabled = false) {
  return `<label class="toggle-row ${disabled ? 'disabled' : ''}" for="${id}">
    <span><strong>${label}</strong><small>${description}</small></span>
    <input id="${id}" type="checkbox" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} />
    <i aria-hidden="true"></i>
  </label>`;
}

function setupScreen() {
  const canStart = state.fileA && state.fileB && state.ffplay.available;
  return `<main class="page setup-page">
    <section class="hero">
      <h1>Compare two tracks.</h1>
      <p>Drop in two files, then listen without seeing which is which.</p>
    </section>

    ${state.error ? `<div class="error-banner">${escapeHtml(state.error)}</div>` : ''}

    <section class="setup-grid">
      ${fileCard('a', state.fileA, 'TRACK A')}
      ${fileCard('b', state.fileB, 'TRACK B')}
    </section>

    <details class="settings-panel">
      <summary><span>${icon('settings')} Settings</span><small>${state.trials} rounds · ${state.volume}% volume</small></summary>
      <div class="settings-content">
        <div class="setting-control">
          <div class="control-label"><label for="trials">Rounds</label><strong id="trial-value">${state.trials}</strong></div>
          <input id="trials" type="range" min="1" max="20" value="${state.trials}" style="--fill:${(state.trials - 1) / 19 * 100}%" />
        </div>
        <div class="setting-control">
          <div class="control-label"><label for="volume">Volume</label><strong id="volume-value">${state.volume}%</strong></div>
          <input id="volume" type="range" min="0" max="100" value="${state.volume}" style="--fill:${state.volume}%" />
        </div>
        <div class="toggle-group">
          ${toggleSetting('replay-gain', 'ReplayGain', 'Use loudness tags when available', state.replayGain)}
          ${toggleSetting('album-gain', 'Album gain', 'Prefer album gain over track gain', state.albumGain, !state.replayGain)}
        </div>
        <div class="path-setting">
          <label for="ffplay-path">FFplay path <span>optional</span></label>
          <input id="ffplay-path" type="text" placeholder="Auto-detect from PATH" value="${escapeHtml(state.ffplayPath)}" />
        </div>
      </div>
    </details>

    <button class="button primary start-button" id="start-test" ${canStart ? '' : 'disabled'}>Start comparison ${icon('arrow')}</button>
  </main>`;
}

function playerCard(letter) {
  const active = state.playing === letter;
  return `<div class="player-card ${active ? 'is-playing' : ''}">
    <div class="player-letter">${letter}</div>
    <div class="player-copy"><span class="player-title">Sample ${letter}</span><span class="player-subtitle">${active ? 'Playing now' : 'Listen before deciding'}</span></div>
    <button class="play-button ${active ? 'stop' : ''}" data-play="${letter}" aria-label="${active ? 'Stop' : 'Play'} sample ${letter}">${icon(active ? 'stop' : 'play')}</button>
    <div class="playing-bars"><i></i><i></i><i></i><i></i></div>
  </div>`;
}

function testingScreen() {
  const round = state.currentTrial + 1;
  return `<main class="page test-page">
    <div class="test-heading">
      <div><div class="eyebrow">LISTEN & CHOOSE</div><h1>Which one feels better?</h1><p>Take your time. You can replay either sample as often as you like.</p></div>
      <div class="round-count"><span>ROUND</span><strong>${String(round).padStart(2, '0')} <small>/ ${String(state.trials).padStart(2, '0')}</small></strong></div>
    </div>
    ${state.error ? `<div class="error-banner">${escapeHtml(state.error)}</div>` : ''}
    <div class="players">${playerCard('A')}${playerCard('B')}</div>
    <div class="test-divider"><span>YOUR PREFERENCE</span></div>
    <div class="preference-row">
      <button class="preference-button" data-choice="A"><span class="preference-letter">A</span><span>I prefer A</span>${icon('arrow')}</button>
      <button class="preference-button" data-choice="B"><span class="preference-letter">B</span><span>I prefer B</span>${icon('arrow')}</button>
    </div>
    <div class="test-tip"><span>Tip</span> Use headphones if you can, and keep the volume consistent between rounds.</div>
  </main>`;
}

function resultsScreen() {
  const a = state.choices.filter((choice) => choice === 'A').length;
  const b = state.choices.length - a;
  const winner = a === b ? 'It’s a tie' : `${a > b ? 'Sample A' : 'Sample B'} wins`;
  const winnerCount = Math.max(a, b);
  return `<main class="page results-page">
    <div class="results-heading"><div class="eyebrow">TEST COMPLETE</div><h1>${winner} <span class="winner-spark">✦</span></h1><p>You made ${state.choices.length} preference choices. Here is the breakdown.</p></div>
    <section class="result-card">
      <div class="result-top"><span class="result-label">YOUR PREFERENCE</span><span class="result-rounds">${state.choices.length} rounds</span></div>
      <div class="result-bars">
        <div class="result-side"><div class="result-number">${a}</div><div class="result-side-label">Sample A</div></div>
        <div class="bar-track"><div class="bar-fill a-fill" style="width:${state.choices.length ? (a / state.choices.length) * 100 : 50}%"></div><div class="bar-fill b-fill" style="width:${state.choices.length ? (b / state.choices.length) * 100 : 50}%"></div></div>
        <div class="result-side right"><div class="result-number">${b}</div><div class="result-side-label">Sample B</div></div>
      </div>
      <div class="result-percentages"><span>${state.choices.length ? Math.round(a / state.choices.length * 100) : 50}%</span><span>${state.choices.length ? Math.round(b / state.choices.length * 100) : 50}%</span></div>
    </section>
    <div class="confidence-note"><span class="confidence-icon">${icon('check')}</span><div><strong>${a === b ? 'No clear preference yet.' : `${winnerCount} of ${state.choices.length} rounds leaned this way.`}</strong><br /><span>${a === b ? 'Try a few more rounds if you want a stronger signal.' : 'A consistent choice is a useful signal, but trust your ears.'}</span></div></div>
    <div class="results-actions"><button class="button secondary" id="new-test">${icon('refresh')} New test</button><button class="button primary" id="run-again">Run these files again ${icon('arrow')}</button></div>
  </main>`;
}

function render() {
  app.innerHTML = `${header()}${state.screen === 'setup' ? setupScreen() : state.screen === 'test' ? testingScreen() : resultsScreen()}`;
  bindEvents();
}

async function checkFfplay() {
  try {
    state.ffplay = await invoke('ffplay_status', { customPath: state.ffplayPath || null });
  } catch (error) {
    state.ffplay = { available: false, executable: '' };
    state.error = String(error);
  }
  if (state.screen === 'setup') render();
}

async function chooseFile(slot) {
  try {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Audio files', extensions: AUDIO_EXTENSIONS }],
    });
    if (typeof selected !== 'string') return;
    state[slot === 'a' ? 'fileA' : 'fileB'] = selected;
    state.error = '';
    render();
  } catch (error) {
    state.error = `Could not open the file picker: ${error}`;
    render();
  }
}
function dropSlotAt(position) {
  const scale = window.devicePixelRatio || 1;
  return document
    .elementsFromPoint(position.x / scale, position.y / scale)
    .find((element) => element.matches?.('[data-slot]'))
    ?.dataset.slot;
}

function clearDropHighlight() {
  document.querySelectorAll('.file-drop.drag-over').forEach((element) => element.classList.remove('drag-over'));
}

function assignDroppedFiles(paths, preferredSlot) {
  const audioPaths = paths.filter((path) => AUDIO_EXTENSIONS.includes(path.split('.').pop()?.toLowerCase()));
  if (!audioPaths.length) {
    state.error = 'Drop an audio file such as MP3, FLAC, WAV, AAC, or OGG.';
    render();
    return;
  }

  const slots = preferredSlot
    ? [preferredSlot, preferredSlot === 'a' ? 'b' : 'a']
    : [state.fileA ? (state.fileB ? 'a' : 'b') : 'a', 'b'];
  audioPaths.slice(0, 2).forEach((path, index) => {
    state[slots[index] === 'a' ? 'fileA' : 'fileB'] = path;
  });
  state.error = '';
  render();
}

async function bindFileDrops() {
  await getCurrentWebview().onDragDropEvent((event) => {
    clearDropHighlight();
    if (state.screen !== 'setup' || event.payload.type === 'leave') return;
    const slot = dropSlotAt(event.payload.position);
    if (event.payload.type === 'drop') {
      assignDroppedFiles(event.payload.paths, slot);
      return;
    }
    document.querySelector(`[data-slot="${slot}"]`)?.classList.add('drag-over');
  });
}

async function togglePlayback(letter) {
  const path = letter === 'A' ? state.fileA : state.fileB;
  if (!path) return;
  state.error = '';
  if (state.playing === letter) {
    await invoke('stop_playback');
    state.playing = null;
    render();
    return;
  }
  try {
    await invoke('start_playback', {
      path,
      volume: state.volume,
      replayGain: state.replayGain,
      albumGain: state.albumGain,
      customPath: state.ffplayPath || null,
    });
    state.playing = letter;
    render();
  } catch (error) {
    state.playing = null;
    state.error = String(error);
    render();
  }
}

async function choosePreference(choice) {
  await invoke('stop_playback').catch(() => {});
  state.playing = null;
  state.choices.push(choice);
  if (state.choices.length >= state.trials) {
    state.screen = 'results';
  } else {
    state.currentTrial += 1;
  }
  render();
}

function startTest() {
  if (!state.fileA || !state.fileB) return;
  if (!state.ffplay.available) {
    state.error = 'FFplay was not found. Install FFmpeg or set its executable path in Playback settings.';
    render();
    return;
  }
  state.error = '';
  state.currentTrial = 0;
  state.choices = [];
  state.playing = null;
  state.screen = 'test';
  render();
}

function bindEvents() {
  document.querySelectorAll('.file-drop').forEach((button) => button.addEventListener('click', () => chooseFile(button.dataset.slot)));
  document.querySelector('#start-test')?.addEventListener('click', startTest);
  document.querySelectorAll('[data-play]').forEach((button) => button.addEventListener('click', () => togglePlayback(button.dataset.play)));
  document.querySelectorAll('[data-choice]').forEach((button) => button.addEventListener('click', () => choosePreference(button.dataset.choice)));
  document.querySelector('#new-test')?.addEventListener('click', () => {
    state.screen = 'setup'; state.choices = []; state.currentTrial = 0; render();
  });
  document.querySelector('#run-again')?.addEventListener('click', () => {
    state.screen = 'test'; state.choices = []; state.currentTrial = 0; state.error = ''; render();
  });
  document.querySelector('#trials')?.addEventListener('input', (event) => {
    state.trials = Number(event.target.value);
    event.target.style.setProperty('--fill', `${(state.trials - 1) / 19 * 100}%`);
    document.querySelector('#trial-value').textContent = state.trials;
    saveSettings();
  });
  document.querySelector('#volume')?.addEventListener('input', (event) => {
    state.volume = Number(event.target.value);
    event.target.style.setProperty('--fill', `${state.volume}%`);
    document.querySelector('#volume-value').textContent = `${state.volume}%`;
    saveSettings();
  });
  document.querySelector('#replay-gain')?.addEventListener('change', (event) => {
    state.replayGain = event.target.checked;
    saveSettings();
    render();
  });
  document.querySelector('#album-gain')?.addEventListener('change', (event) => {
    state.albumGain = event.target.checked;
    saveSettings();
  });
  document.querySelector('#ffplay-path')?.addEventListener('change', async (event) => {
    state.ffplayPath = event.target.value.trim();
    saveSettings();
    await checkFfplay();
  });
}

render();
checkFfplay();
bindFileDrops().catch(() => {});
window.addEventListener('beforeunload', () => invoke('stop_playback').catch(() => {}));
