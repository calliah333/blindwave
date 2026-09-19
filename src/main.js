import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import './styles.css';

const AUDIO_EXTENSIONS = ['mp3', 'flac', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'aiff', 'ape', 'wma'];
const EXCERPT_SECONDS = 15;
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
  commonDuration: 0,
  rounds: [],
  currentTrial: 0,
  choices: [],
  heard: [],
  playing: null,
  playbackOffset: 0,
  playbackStartedAt: null,
  preparing: false,
  revealOnNextChoice: false,
  error: '',
};

const app = document.querySelector('#app');
let playbackTimer = null;
let progressFrame = null;

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
      <span class="file-path" ${path ? `title="${escapeHtml(path)}"` : ''}>${path ? escapeHtml(path) : 'or click to choose'}</span>
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
  const canStart = state.fileA && state.fileB && state.ffplay.available && !state.preparing;
  return `<main class="page setup-page">
    <section class="hero">
      <h1>Compare two tracks.</h1>
      <p>Drop in two versions. Each round uses a different synchronized excerpt from across the track.</p>
    </section>

    ${state.error ? `<div class="error-banner">${escapeHtml(state.error)}</div>` : ''}

    <section class="setup-grid">
      ${fileCard('a', state.fileA, 'VERSION 1')}
      ${fileCard('b', state.fileB, 'VERSION 2')}
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

    <button class="button primary start-button" id="start-test" ${canStart ? '' : 'disabled'}>${state.preparing ? 'Inspecting tracks…' : `Start comparison ${icon('arrow')}`}</button>
  </main>`;
}

function formatTime(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function currentRound() {
  return state.rounds[state.currentTrial];
}

function sourceForLetter(round, letter) {
  if (letter === 'A') return round.swapped ? 'fileB' : 'fileA';
  return round.swapped ? 'fileA' : 'fileB';
}

function playerCard(letter) {
  const active = state.playing === letter;
  const heard = state.heard.includes(letter);
  const subtitle = active
    ? 'Playing now'
    : state.playing
      ? 'Switch at the same position'
      : state.playbackOffset > 0
        ? 'Resume the synced excerpt'
        : 'Play this excerpt';
  return `<div class="player-card ${active ? 'is-playing' : ''} ${heard ? 'has-played' : ''}">
    <div class="player-letter">${letter}</div>
    <div class="player-copy"><span class="player-title">Sample ${letter}</span><span class="player-subtitle">${subtitle}</span></div>
    <button class="play-button ${active ? 'stop' : ''}" data-play="${letter}" aria-label="${active ? 'Pause' : state.playing ? 'Switch to' : 'Play'} sample ${letter}">${icon(active ? 'stop' : 'play')}</button>
    <div class="playing-bars"><i></i><i></i><i></i><i></i></div>
  </div>`;
}

function testingScreen() {
  const roundNumber = state.currentTrial + 1;
  const round = currentRound();
  const canChoose = state.heard.includes('A') && state.heard.includes('B');
  return `<main class="page test-page">
    <div class="test-heading">
      <div><div class="eyebrow">LISTEN & CHOOSE</div><h1>Which one feels better?</h1><p>Switch between A and B. Both continue from the same point in the track.</p></div>
      <div class="round-count"><span>ROUND</span><strong>${String(roundNumber).padStart(2, '0')} <small>/ ${String(state.trials).padStart(2, '0')}</small></strong></div>
    </div>
    ${state.error ? `<div class="error-banner">${escapeHtml(state.error)}</div>` : ''}
    <div class="excerpt-note"><strong>Synced excerpt</strong><span>${formatTime(round.start)}–${formatTime(round.start + round.length)}</span><small>New section each round</small></div>
    <div class="playback-progress">
      <span id="progress-current">${formatTime(round.start + state.playbackOffset)}</span>
      <input id="playback-progress" type="range" min="0" max="${round.length}" step="0.01" value="${state.playbackOffset}" style="--fill:${state.playbackOffset / round.length * 100}%" aria-label="Playback position within the synced excerpt" />
      <span>${formatTime(round.start + round.length)}</span>
    </div>
    <div class="players">${playerCard('A')}${playerCard('B')}</div>
    <div class="test-divider"><span>${canChoose ? 'YOUR PREFERENCE' : 'LISTEN TO BOTH TO CHOOSE'}</span></div>
    <div class="preference-row">
      <button class="preference-button" data-choice="A" ${canChoose ? '' : 'disabled'}><span class="preference-letter">A</span><span>I prefer A</span>${icon('arrow')}</button>
      <button class="preference-button" data-choice="B" ${canChoose ? '' : 'disabled'}><span class="preference-letter">B</span><span>I prefer B</span>${icon('arrow')}</button>
    </div>
    <div class="early-result-row">
      <button class="finish-button ${state.revealOnNextChoice ? 'is-armed' : ''}" id="reveal-next-choice" aria-pressed="${state.revealOnNextChoice}">
        ${state.revealOnNextChoice ? 'Will reveal on next choice · Cancel' : 'Reveal result on next choice'}
      </button>
    </div>
  </main>`;
}

function resultsScreen() {
  const first = state.choices.filter((choice) => choice === 'fileA').length;
  const second = state.choices.length - first;
  const winner = first === second ? 'It’s a tie' : `Version ${first > second ? '1' : '2'} wins`;
  const winnerCount = Math.max(first, second);
  const roundLabel = `${state.choices.length} round${state.choices.length === 1 ? '' : 's'}`;
  return `<main class="page results-page">
    <div class="results-heading"><div class="eyebrow">TEST COMPLETE</div><h1>${escapeHtml(winner)} <span class="winner-spark">✦</span></h1><p>The sample labels changed between rounds to keep the comparison blind.</p></div>
    <section class="result-card">
      <div class="result-top"><span class="result-label">YOUR PREFERENCE</span><span class="result-rounds">${roundLabel}</span></div>
      <div class="result-bars">
        <div class="result-side"><div class="result-number">${first}</div><div class="result-source-tag">VERSION 1</div><div class="result-side-label" title="${escapeHtml(state.fileA)}">${escapeHtml(state.fileA)}</div></div>
        <div class="bar-track"><div class="bar-fill a-fill" style="width:${state.choices.length ? (first / state.choices.length) * 100 : 50}%"></div><div class="bar-fill b-fill" style="width:${state.choices.length ? (second / state.choices.length) * 100 : 50}%"></div></div>
        <div class="result-side right"><div class="result-number">${second}</div><div class="result-source-tag">VERSION 2</div><div class="result-side-label" title="${escapeHtml(state.fileB)}">${escapeHtml(state.fileB)}</div></div>
      </div>
      <div class="result-percentages"><span>${state.choices.length ? Math.round(first / state.choices.length * 100) : 50}%</span><span>${state.choices.length ? Math.round(second / state.choices.length * 100) : 50}%</span></div>
    </section>
    <div class="confidence-note"><span class="confidence-icon">${icon('check')}</span><div><strong>${first === second ? 'No clear preference yet.' : `${winnerCount} of ${roundLabel} preferred this version.`}</strong><br /><span>${first === second ? 'Try another run with fresh excerpts.' : 'The test sampled synchronized sections from across both tracks.'}</span></div></div>
    <div class="results-actions"><button class="button secondary" id="new-test">${icon('refresh')} New files</button><button class="button primary" id="run-again">Try new excerpts ${icon('arrow')}</button></div>
  </main>`;
}

function render() {
  if (progressFrame !== null) {
    cancelAnimationFrame(progressFrame);
    progressFrame = null;
  }
  app.innerHTML = `${header()}${state.screen === 'setup' ? setupScreen() : state.screen === 'test' ? testingScreen() : resultsScreen()}`;
  bindEvents();
  refreshProgressDisplay();
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

function randomUnit() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] / 0x100000000;
}

function shuffled(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(randomUnit() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function createRounds(duration, count) {
  const length = Math.min(EXCERPT_SECONDS, duration);
  const latestStart = Math.max(0, duration - length);
  const starts = latestStart === 0
    ? Array(count).fill(0)
    : Array.from({ length: count }, (_, index) => (
      ((index + randomUnit()) / count) * latestStart
    ));
  let mappings = Array.from({ length: count }, (_, index) => index % 2 === 0);
  if (randomUnit() > 0.5) mappings = mappings.map((value) => !value);
  mappings = shuffled(mappings);
  return shuffled(starts).map((start, index) => ({
    start,
    length,
    swapped: mappings[index],
  }));
}

function clearPlaybackTimer() {
  if (playbackTimer !== null) {
    clearTimeout(playbackTimer);
    playbackTimer = null;
  }
}

function syncedOffset() {
  if (!state.playing || state.playbackStartedAt === null) return state.playbackOffset;
  return Math.min(
    currentRound().length,
    state.playbackOffset + (performance.now() - state.playbackStartedAt) / 1000,
  );
}

function updateProgressDisplay(offset) {
  const progress = document.querySelector('#playback-progress');
  const current = document.querySelector('#progress-current');
  if (!progress || !current || state.screen !== 'test') return;
  const round = currentRound();
  const boundedOffset = Math.min(round.length, Math.max(0, offset));
  progress.value = String(boundedOffset);
  progress.style.setProperty('--fill', `${boundedOffset / round.length * 100}%`);
  progress.setAttribute('aria-valuetext', `${formatTime(round.start + boundedOffset)} of ${formatTime(round.start + round.length)}`);
  current.textContent = formatTime(round.start + boundedOffset);
}

function refreshProgressDisplay() {
  if (state.screen !== 'test') return;
  const progress = document.querySelector('#playback-progress');
  if (document.activeElement !== progress) updateProgressDisplay(syncedOffset());
  if (state.playing) progressFrame = requestAnimationFrame(refreshProgressDisplay);
}

function resetPlaybackPosition() {
  clearPlaybackTimer();
  state.playing = null;
  state.playbackOffset = 0;
  state.playbackStartedAt = null;
}

function beginTest() {
  state.rounds = createRounds(state.commonDuration, state.trials);
  state.currentTrial = 0;
  state.choices = [];
  state.heard = [];
  state.error = '';
  state.revealOnNextChoice = false;
  resetPlaybackPosition();
  state.screen = 'test';
  render();
}

async function startSamplePlayback(letter, offset) {
  const round = currentRound();
  const path = state[sourceForLetter(round, letter)];
  if (!path) return;
  const remaining = round.length - offset;
  await invoke('start_playback', {
    path,
    volume: state.volume,
    replayGain: state.replayGain,
    albumGain: state.albumGain,
    startAt: round.start + offset,
    playFor: remaining,
    customPath: state.ffplayPath || null,
  });
  clearPlaybackTimer();
  state.playing = letter;
  state.playbackOffset = offset;
  state.playbackStartedAt = performance.now();
  if (!state.heard.includes(letter)) state.heard.push(letter);
  playbackTimer = window.setTimeout(() => {
    if (state.screen !== 'test') return;
    resetPlaybackPosition();
    render();
  }, (remaining + 0.2) * 1000);
  render();
}

async function togglePlayback(letter) {
  state.error = '';
  const offset = syncedOffset();
  if (state.playing === letter) {
    await invoke('stop_playback').catch(() => {});
    clearPlaybackTimer();
    state.playing = null;
    state.playbackOffset = offset;
    state.playbackStartedAt = null;
    render();
    return;
  }

  const nextOffset = currentRound().length - offset < 0.15 ? 0 : offset;
  try {
    await startSamplePlayback(letter, nextOffset);
  } catch (error) {
    resetPlaybackPosition();
    state.error = String(error);
    render();
  }
}

async function seekPlayback(rawOffset) {
  const round = currentRound();
  const offset = Math.min(Math.max(0, Number(rawOffset)), Math.max(0, round.length - 0.05));
  const activeSample = state.playing;
  if (activeSample) await invoke('stop_playback').catch(() => {});
  clearPlaybackTimer();
  state.playing = null;
  state.playbackOffset = offset;
  state.playbackStartedAt = null;
  if (!activeSample) {
    render();
    return;
  }

  try {
    await startSamplePlayback(activeSample, offset);
  } catch (error) {
    resetPlaybackPosition();
    state.error = String(error);
    render();
  }
}

async function choosePreference(choice) {
  if (!state.heard.includes('A') || !state.heard.includes('B')) return;
  await invoke('stop_playback').catch(() => {});
  clearPlaybackTimer();
  state.choices.push(sourceForLetter(currentRound(), choice));
  resetPlaybackPosition();
  if (state.revealOnNextChoice || state.choices.length >= state.trials) {
    state.revealOnNextChoice = false;
    state.screen = 'results';
  } else {
    state.currentTrial += 1;
    state.heard = [];
  }
  render();
}

async function startTest() {
  if (!state.fileA || !state.fileB || state.preparing) return;
  if (!state.ffplay.available) {
    state.error = 'FFplay was not found. Install FFmpeg or set its executable path in Settings.';
    render();
    return;
  }

  state.error = '';
  state.preparing = true;
  render();
  try {
    const [firstDuration, secondDuration] = await Promise.all([
      invoke('audio_duration', { path: state.fileA, customPath: state.ffplayPath || null }),
      invoke('audio_duration', { path: state.fileB, customPath: state.ffplayPath || null }),
    ]);
    state.commonDuration = Math.min(firstDuration, secondDuration);
    state.preparing = false;
    beginTest();
  } catch (error) {
    state.preparing = false;
    state.error = String(error);
    render();
  }
}

function bindEvents() {
  document.querySelectorAll('.file-drop').forEach((button) => button.addEventListener('click', () => chooseFile(button.dataset.slot)));
  document.querySelector('#start-test')?.addEventListener('click', startTest);
  document.querySelectorAll('[data-play]').forEach((button) => button.addEventListener('click', () => togglePlayback(button.dataset.play)));
  document.querySelector('#playback-progress')?.addEventListener('input', (event) => {
    updateProgressDisplay(Number(event.currentTarget.value));
  });
  document.querySelector('#playback-progress')?.addEventListener('change', (event) => {
    const offset = Number(event.currentTarget.value);
    event.currentTarget.blur();
    seekPlayback(offset);
  });
  document.querySelectorAll('[data-choice]').forEach((button) => button.addEventListener('click', () => choosePreference(button.dataset.choice)));
  document.querySelector('#reveal-next-choice')?.addEventListener('click', () => {
    state.revealOnNextChoice = !state.revealOnNextChoice;
    render();
  });
  document.querySelector('#new-test')?.addEventListener('click', () => {
    state.screen = 'setup';
    state.rounds = [];
    state.choices = [];
    state.currentTrial = 0;
    state.heard = [];
    state.revealOnNextChoice = false;
    resetPlaybackPosition();
    render();
  });
  document.querySelector('#run-again')?.addEventListener('click', beginTest);
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
window.addEventListener('beforeunload', () => {
  clearPlaybackTimer();
  invoke('stop_playback').catch(() => {});
});
