import fs from 'node:fs';
const sr=48000,duration=28,N=sr*duration,L=new Float64Array(N),R=new Float64Array(N);
let seed=8241;const noise=()=>{seed=(seed*16807)%2147483647;return seed/1073741823.5-1};
const hz=n=>440*2**((n-69)/12);
function add(at,dur,fn,amp=1,pan=0){const off=Math.round(at*sr),len=Math.floor(dur*sr);for(let i=0;i<len&&off+i<N;i++){const t=i/sr,v=fn(t,i)*amp;L[off+i]+=v*(1-pan*.45);R[off+i]+=v*(1+pan*.45)}}
// Warm major-seventh voicings: Dm9 / Bbmaj7 / Fmaj9 / Cadd9.
const chords=[[50,57,60,64,69],[46,53,57,60,65],[41,53,57,60,67],[48,55,60,62,67]];
for(let bar=0;bar<14;bar++){
 const notes=chords[Math.floor(bar/2)%4],at=bar*2;
 for(let k=0;k<notes.length;k++){const freq=hz(notes[k]);add(at,2.8,t=>{const env=Math.min(1,t/.35)*Math.min(1,(2.8-t)/.8);return env*(Math.sin(2*Math.PI*freq*t)+.25*Math.sin(2*Math.PI*freq*1.002*t)+.13*Math.sin(4*Math.PI*freq*t))},.026,(k-2)/2)}
 if(bar>=1&&bar<12){for(let b=0;b<4;b++){add(at+b*.5,.38,t=>Math.sin(2*Math.PI*(46*t+80*.025*(1-Math.exp(-t/.025))))*Math.exp(-t*13),.24);const freq=hz(notes[0]-12);add(at+b*.5,.40,t=>Math.sin(2*Math.PI*freq*t)*Math.min(1,t/.012)*Math.exp(-t*7),.11)}
 for(let h=0;h<8;h++)add(at+h*.25,.055,t=>noise()*Math.exp(-t*90),h%2?.023:.014,h%2?.65:-.65);
 for(const b of [1,3])add(at+b*.5,.16,t=>(noise()*.65+Math.sin(2*Math.PI*185*t)*.35)*Math.exp(-t*32),.07,.08);
 }
 if(bar>=1&&bar<13){for(let k=0;k<8;k++){const freq=hz(notes[[0,2,3,1,4,2,3,1][k]]+12),a=at+k*.25;const tone=t=>Math.sin(2*Math.PI*freq*t)*Math.exp(-t*8)*Math.min(1,t/.005)+.15*Math.sin(4*Math.PI*freq*t)*Math.exp(-t*20);add(a,.7,tone,.038,k%2?.4:-.4);add(a+.375,.7,tone,.012,k%2?-.6:.6)}}
}
// Soft movement accents at edits, restrained interaction sounds.
for(const at of [1.65,5.65,9.65,13.65,17.65,21.65,24.65])add(at,.5,t=>noise()*Math.sin(Math.PI*t/.5)**2*.5,.048,0);
for(const at of [2.0,2.25,2.5,6.3,10.3,15.3,16.6,20.15])add(at,.04,t=>(noise()*.4+Math.sin(2*Math.PI*1600*t)) *Math.exp(-t*110),.065,0);
for(const [at,n] of [[18.65,81],[18.82,88],[25.00,74],[25.16,81],[25.33,86]]){const freq=hz(n);add(at,1.1,t=>Math.sin(2*Math.PI*freq*t)*Math.exp(-t*6)*Math.min(1,t/.003),.085,.15);add(at+.22,1.1,t=>Math.sin(2*Math.PI*freq*t)*Math.exp(-t*7),.019,-.5)}
let peak=0;for(let i=0;i<N;i++){const fade=Math.min(1,i/sr/.12,(duration-i/sr)/1.1);L[i]=Math.tanh(L[i]*1.4)*fade;R[i]=Math.tanh(R[i]*1.4)*fade;peak=Math.max(peak,Math.abs(L[i]),Math.abs(R[i]))}
const data=Buffer.alloc(N*4+44);data.write('RIFF');data.writeUInt32LE(N*4+36,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(2,22);data.writeUInt32LE(sr,24);data.writeUInt32LE(sr*4,28);data.writeUInt16LE(4,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(N*4,40);for(let i=0;i<N;i++){data.writeInt16LE(Math.round(L[i]/peak*.84*32767),44+i*4);data.writeInt16LE(Math.round(R[i]/peak*.84*32767),46+i*4)}fs.writeFileSync(new URL('./public/soundtrack-v2.wav',import.meta.url),data);console.log('Original stereo soundtrack: 28 seconds / 120 BPM / 48 kHz');
