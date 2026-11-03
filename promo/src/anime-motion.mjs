import {createTimeline, stagger} from 'animejs';

// Paused object timelines only. No DOM mutation, wall-clock animation or RAF.
// Absolute seeks must also work when Remotion requests frames out of order.
const curves = new Map();
export function progress(t, at = 0, duration = .65, ease = 'outExpo') {
  let entry = curves.get(ease);
  if (!entry) {
    const value = {p: 0};
    const timeline = createTimeline({autoplay: false}).add(value, {p: [0, 1], duration: 1000, ease}, 0);
    entry = {value, timeline}; curves.set(ease, entry);
  }
  entry.timeline.seek(Math.max(0, Math.min(1000, (t-at)/duration*1000)), true);
  return entry.value.p;
}
const cards = Array.from({length: 6}, () => ({opacity: 0, y: 64, scale: .93}));
const entrance = createTimeline({autoplay: false}).add(cards, {
  opacity: [0, 1], y: [64, 0], scale: [.93, 1],
  delay: stagger(95), duration: 800, ease: 'outExpo',
}, 0);
export function terminalEntrance(t) {
  entrance.seek(Math.max(0, Math.min(1300, (t-1.8)*1000)), true);
  return cards.map(({opacity, y, scale}) => ({opacity, y, scale}));
}
export const windowed = (t, a, b, d=.28) => progress(t,a,d,'inOutSine')*(1-progress(t,b-d,d,'inOutSine'));
export const cubic = (a,b,c,d,p) => (1-p)**3*a+3*(1-p)**2*p*b+3*(1-p)*p*p*c+p**3*d;
