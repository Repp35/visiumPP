(()=>{'use strict';
const $=id=>document.getElementById(id);
const square=$('square'),colorStage=$('color-stage');
const separation=$('separation'),duration=$('duration'),motionRate=$('motion-rate'),colorRate=$('color-rate'),negativeImage=$('negative-image');
const rulerStage = $('ruler-stage');
const rulerSquare = $('ruler-square');
const startRulerButton = $('start-ruler');
const stopRulerButton = $('stop-ruler');
const rulerDecay = 3.8;
const rulerPhaseStep = 2 * Math.PI / 12;
const rulerMaxAngularSpeed = 2 * Math.PI * 12;
const rulerDuration = 1.6;
const rulerFlickWindow = 75;
const rulerDragTravel = .96;
let motionStyle = 'ruler';
let rulerDrag = null;
let frameInterval = 1000 / 60;
let lastFrameSample;
let motionPhase = 0;
let mode='motion',running=false,animationId=0,startTime=0,selectedMotionRate=40,currentColor=0,lastColorChange=-Infinity,fpsFrames=0,fpsStart=0;
const INTRO=2000,NEGATIVE=14000,GRAYSCALE=7000,TOTAL=INTRO+NEGATIVE+GRAYSCALE;
function updateLabels(){
$('separation-value').textContent=separation.value+' px';$('duration-value').textContent=duration.value+' s';
$('motion-rate-value').textContent=selectedMotionRate.toLocaleString('pt-BR')+' Hz';$('color-rate-value').textContent=colorRate.value+' Hz';
document.querySelectorAll('#motion-presets button').forEach(b=>b.classList.toggle('active',Number(b.dataset.rate)===selectedMotionRate));
document.querySelectorAll('#color-presets button').forEach(b=>b.classList.toggle('active',Number(b.dataset.rate)===Number(colorRate.value)));
}
separation.addEventListener('input',updateLabels);duration.addEventListener('input',updateLabels);
motionRate.addEventListener('input',()=>{selectedMotionRate=Number(motionRate.value);updateLabels()});
colorRate.addEventListener('input',updateLabels);
document.querySelectorAll('#motion-presets button').forEach(b=>b.onclick=()=>{selectedMotionRate=Number(b.dataset.rate);if(selectedMotionRate<=200)motionRate.value=selectedMotionRate;updateLabels()});
document.querySelectorAll('#color-presets button').forEach(b=>b.onclick=()=>{colorRate.value=b.dataset.rate;updateLabels()});
function resetAfterimage(){negativeImage.classList.remove('visible');$('timer-progress').style.width='0%';$('phase-label').textContent='Pronto';$('countdown').textContent='23 s'}
function stop() {
  running = false;
  cancelAnimationFrame(animationId);
  square.style.transform = 'translate3d(0,0,0)';
  if (rulerDrag) {
    const { pointerId } = rulerDrag;
    rulerDrag = null;
    if (rulerStage.hasPointerCapture(pointerId)) rulerStage.releasePointerCapture(pointerId);
  }
  rulerSquare.style.removeProperty('--ruler-offset');
  for (const panel of ['motion', 'ruler', 'color', 'afterimage']) $('stop-' + panel).disabled = true;
  $('start-motion').textContent = 'Iniciar vibração';
  $('start-color').textContent = 'Iniciar cores';
  $('start-afterimage').textContent = 'Iniciar efeito';
  $('status').textContent = 'Parado';
  $('intensity').textContent = '0%';
  resetAfterimage();
}

function switchMotionStyle(next) {
  if (next === motionStyle) return;
  stop();
  motionStyle = next;
  for (const style of ['ruler', 'saitama']) {
    const active = style === next;
    $(style + '-panel').hidden = !active;
    if (active) {
      const panel = $(style + '-panel');
      panel.classList.remove('entrada-aba');
      void panel.offsetWidth;
      panel.classList.add('entrada-aba');
      revealMotionObject();
    }
    const button = $('mode-' + style);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}

function setRulerOffset(offset, intensity) {
  rulerSquare.style.setProperty('--ruler-offset', offset + 'px');
  $('intensity').textContent = Math.round(intensity * 100) + '%';
}

function rulerTravel() {
  const stageCenter = rulerStage.clientWidth / 2;
  return Math.max(1, stageCenter - rulerSquare.offsetWidth / 2);
}

function rulerAngularSpeed() {
  return Math.min(rulerMaxAngularSpeed, rulerPhaseStep * 1000 / frameInterval);
}

function startRuler(offset, velocity) {
  stop();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  running = true;
  stopRulerButton.disabled = false;
  $('status').textContent = 'Oscilando';
  const travel = rulerTravel();
  const momentumLimit = Math.sqrt(Math.max(0, travel ** 2 - offset ** 2));
  const momentum = (velocity + rulerDecay * offset) / rulerAngularSpeed();
  const sineAmplitude = Math.max(-momentumLimit, Math.min(momentumLimit, momentum));
  const amplitude = Math.hypot(offset, sineAmplitude);
  const initialIntensity = amplitude / travel;
  const direction = Math.sign(offset || velocity) || 1;
  setRulerOffset(offset, initialIntensity);
  let firstFrame;
  let phase = 0;

  function frame(now) {
    if (!running || mode !== 'motion' || motionStyle !== 'ruler') return;
    firstFrame ??= now;
    const elapsed = (now - firstFrame) / 1000;
    if (elapsed >= rulerDuration) {
      stop();
      $('status').textContent = 'Estabilizado';
      return;
    }
    const envelope = Math.exp(-rulerDecay * elapsed);
    // Como no modo Saitama, cada quadro ocupa uma das três posições.
    const position = [direction, 0, -direction][phase];
    setRulerOffset(position * amplitude * envelope, initialIntensity * envelope);
    phase = (phase + 1) % 3;
    animationId = requestAnimationFrame(frame);
  }

  animationId = requestAnimationFrame(frame);
}

$('mode-ruler').onclick = () => switchMotionStyle('ruler');
$('mode-saitama').onclick = () => switchMotionStyle('saitama');
startRulerButton.onclick = () => startRuler(0, rulerTravel() * rulerAngularSpeed());
stopRulerButton.onclick = stop;

function revealMotionObject(target = motionStyle === 'ruler' ? rulerSquare : square) {
  target.classList.remove('changing-image');
  void target.offsetWidth;
  target.classList.add('changing-image');
}

function setupMotionImage(effect, target) {
  const letter = $(effect + '-letter');
  const image = $(effect + '-custom-image');
  const input = $(effect + '-image-file');
  const error = $(effect + '-image-error');
  const reset = $('reset-' + effect + '-image');
  let currentUrl = null;
  let request = 0;

  function showImage(url, aspectRatio) {
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = url;
    if (url) {
      image.src = url;
      target.style.setProperty('--image-aspect', aspectRatio);
    } else {
      image.removeAttribute('src');
      target.style.removeProperty('--image-aspect');
    }
    image.hidden = !url;
    letter.hidden = Boolean(url);
    reset.disabled = !url;
    target.classList.toggle('has-image', Boolean(url));
    revealMotionObject(target);
  }

  reset.onclick = () => {
    request++;
    error.textContent = '';
    showImage(null);
  };

  input.addEventListener('change', async () => {
    const [file] = input.files;
    if (!file) return;
    error.textContent = '';
    const selection = ++request;
    const url = URL.createObjectURL(file);
    const preview = new Image();
    preview.onload = () => {
      if (selection === request) showImage(url, preview.naturalWidth / preview.naturalHeight);
      else URL.revokeObjectURL(url);
    };
    preview.onerror = () => {
      URL.revokeObjectURL(url);
      if (selection === request) error.textContent = 'Essa imagem não abriu. Escolha outro arquivo.';
    };
    preview.src = url;
    input.value = '';
  });
}

setupMotionImage('ruler', rulerSquare);
setupMotionImage('saitama', square);

rulerStage.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0 || rulerDrag) return;
  stop();
  rulerDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    lastX: event.clientX,
    movedAt: event.timeStamp,
    offset: 0,
    velocity: 0,
  };
  rulerStage.setPointerCapture(event.pointerId);
  stopRulerButton.disabled = false;
  $('status').textContent = 'Puxando';
});

function updateRulerDrag(event) {
  const travel = rulerTravel();
  const limit = travel * rulerDragTravel;
  const distance = event.clientX - rulerDrag.startX;
  rulerDrag.offset = Math.max(-limit, Math.min(limit, distance));
  if (event.clientX !== rulerDrag.lastX) {
    const elapsed = Math.max(8, event.timeStamp - rulerDrag.movedAt);
    rulerDrag.velocity = (event.clientX - rulerDrag.lastX) * 1000 / elapsed;
    rulerDrag.lastX = event.clientX;
    rulerDrag.movedAt = event.timeStamp;
  }
  setRulerOffset(rulerDrag.offset, Math.abs(rulerDrag.offset) / travel);
}

rulerStage.addEventListener('pointermove', event => {
  if (rulerDrag?.pointerId === event.pointerId) updateRulerDrag(event);
});

rulerStage.addEventListener('pointerup', event => {
  if (rulerDrag?.pointerId !== event.pointerId) return;
  updateRulerDrag(event);
  const { offset, velocity, movedAt } = rulerDrag;
  const releaseVelocity = event.timeStamp - movedAt <= rulerFlickWindow ? velocity : 0;
  if (Math.abs(offset) >= 4 || Math.abs(releaseVelocity) >= 120) startRuler(offset, releaseVelocity);
  else stop();
});

for (const eventName of ['pointercancel', 'lostpointercapture']) {
  rulerStage.addEventListener(eventName, event => {
    if (rulerDrag?.pointerId === event.pointerId) stop();
  });
}

function motionFrame(now) {
  if (!running || mode !== 'motion') return;
  const elapsed = Math.max(0, (now - startTime) / 1000);
  const progress = elapsed / Number(duration.value);
  if (progress >= 1) {
    stop();
    $('status').textContent = 'Estabilizado';
    return;
  }
  const damping = Math.pow(1 - progress, 1.3);
  const distance = Number(separation.value) * damping;
  const position = Math.floor(motionPhase) - 1;
  square.style.transform = 'translate3d(' + (position * distance) + 'px,0,0)';
  $('intensity').textContent = Math.round(damping * 100) + '%';

  // Avança pela ordem das posições mesmo se o navegador atrasar um quadro.
  const positionsPerFrame = 3 * selectedMotionRate * frameInterval / 1000;
  const step = positionsPerFrame >= .98 ? 1 : positionsPerFrame;
  motionPhase = (motionPhase + step) % 3;
  animationId = requestAnimationFrame(motionFrame);
}
function startMotion(){stop();mode='motion';running=true;motionPhase=0;startTime=performance.now();$('start-motion').textContent='Reiniciar';$('stop-motion').disabled=false;$('status').textContent='Executando';$('intensity').textContent='100%';animationId=requestAnimationFrame(motionFrame)}
function colorFrame(now){if(!running||mode!=='color')return;const interval=1000/Number(colorRate.value);if(lastColorChange===-Infinity||now-lastColorChange>=interval-.5){currentColor=1-currentColor;colorStage.style.backgroundColor=currentColor===0?'#FF0000':'#00FFFF';lastColorChange=now}animationId=requestAnimationFrame(colorFrame)}
function startColors(){stop();mode='color';running=true;currentColor=0;lastColorChange=-Infinity;colorStage.style.backgroundColor='#FF0000';$('start-color').textContent='Reiniciar';$('stop-color').disabled=false;$('status').textContent='Executando';$('intensity').textContent='100%';animationId=requestAnimationFrame(colorFrame)}
function afterimageFrame(now){if(!running||mode!=='afterimage')return;const elapsed=Math.max(0,now-startTime);$('timer-progress').style.width=Math.min(elapsed/TOTAL*100,100)+'%';$('countdown').textContent=Math.max(0,Math.ceil((TOTAL-elapsed)/1000))+' s';
if(elapsed<INTRO){negativeImage.classList.remove('visible');$('phase-label').textContent='Preparação'}else if(elapsed<INTRO+NEGATIVE){negativeImage.classList.add('visible');$('phase-label').textContent='Imagem invertida'}else if(elapsed<TOTAL){negativeImage.classList.remove('visible');$('phase-label').textContent='Pós-imagem'}else{running=false;negativeImage.classList.remove('visible');$('timer-progress').style.width='100%';$('countdown').textContent='0 s';$('phase-label').textContent='Concluído';$('status').textContent='Concluído';$('intensity').textContent='0%';$('start-afterimage').textContent='Reiniciar';$('stop-afterimage').disabled=true;return}
$('intensity').textContent=Math.round(Math.min(elapsed/TOTAL,1)*100)+'%';animationId=requestAnimationFrame(afterimageFrame)}
function startAfterimage(){stop();mode='afterimage';running=true;startTime=performance.now();negativeImage.classList.remove('visible');$('start-afterimage').textContent='Reiniciar';$('stop-afterimage').disabled=false;$('status').textContent='Executando';$('intensity').textContent='0%';animationId=requestAnimationFrame(afterimageFrame)}
function moveIndicator(){const tabs=document.querySelector('.tabs'),active=tabs.querySelector('button.active'),indicator=tabs.querySelector('.tab-indicator');indicator.style.width=active.offsetWidth+'px';indicator.style.transform='translateX('+(active.offsetLeft-5)+'px)'}
function switchMode(next){if(next===mode)return;stop();mode=next;['motion','color','afterimage'].forEach(m=>{$(m+'-panel').hidden=m!==next;$('tab-'+m).classList.toggle('active',m===next)});moveIndicator();const panel=$(next+'-panel');panel.classList.remove('entrada-aba');void panel.offsetWidth;panel.classList.add('entrada-aba');if(next==='motion')revealMotionObject()}
const colorNotice = $('color-notice');
const colorNoticeKey = 'visiumPP.colorNoticeAccepted.v1';
let colorNoticeAccepted = false;

try {
  colorNoticeAccepted = localStorage.getItem(colorNoticeKey) === 'true';
} catch {
  // The notice still works when the browser blocks storage.
}

$('tab-motion').onclick = () => switchMode('motion');
$('tab-afterimage').onclick = () => switchMode('afterimage');
$('tab-color').onclick = () => {
  if (colorNoticeAccepted) {
    switchMode('color');
  } else {
    colorNotice.showModal();
  }
};

async function dismissColorNotice(accepted, button) {
  if (colorNotice.classList.contains('is-closing')) return;

  button?.classList.add('is-pressed');
  colorNotice.classList.add('is-closing');
  await Promise.allSettled(colorNotice.getAnimations().map(animation => animation.finished));
  colorNotice.close();
  colorNotice.classList.remove('is-closing');
  button?.classList.remove('is-pressed');

  if (!accepted) return;
  colorNoticeAccepted = true;
  try {
    localStorage.setItem(colorNoticeKey, 'true');
  } catch {
    // Keep the confirmation for this page if it cannot be saved.
  }
  switchMode('color');
}

$('cancel-color-notice').onclick = event => dismissColorNotice(false, event.currentTarget);
$('accept-color-notice').onclick = event => dismissColorNotice(true, event.currentTarget);
colorNotice.addEventListener('cancel', event => {
  event.preventDefault();
  dismissColorNotice(false);
});
$('start-motion').onclick=startMotion;$('stop-motion').onclick=stop;$('start-color').onclick=startColors;$('stop-color').onclick=stop;$('start-afterimage').onclick=startAfterimage;$('stop-afterimage').onclick=stop;
function measureFPS(now) {
  const interval = now - lastFrameSample;
  lastFrameSample = now;
  if (interval > 0 && interval < 250) frameInterval += (interval - frameInterval) * .12;
  if (!fpsStart) fpsStart = now;
  fpsFrames++;
  if (now - fpsStart >= 1000) {
    $('fps').textContent = Math.round(fpsFrames * 1000 / (now - fpsStart)) + ' FPS';
    fpsFrames = 0;
    fpsStart = now;
  }
  requestAnimationFrame(measureFPS);
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});updateLabels();moveIndicator();window.addEventListener('resize',moveIndicator);requestAnimationFrame(measureFPS);
const splash=document.getElementById('loading-screen'),app=document.getElementById('app-main');
if(!splash||!app)return;
const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
window.setTimeout(()=>{app.classList.add('ready');splash.classList.add('finished');revealMotionObject();window.setTimeout(()=>splash.remove(),reduce?0:700)},reduce?0:1500);
})();
