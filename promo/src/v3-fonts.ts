import {cancelRender,continueRender,delayRender,staticFile} from 'remotion';
if(typeof document!=='undefined'){
 const handle=delayRender('Load local Tetris V3 fonts');
 Promise.all([400,600].map(async weight=>{
  const face=new FontFace('Tetris V3',`url("${staticFile(`v3-fonts/NotoSansSC-${weight}.ttf`)}")`,{weight:String(weight),display:'block'});
  document.fonts.add(await face.load());
 })).then(async()=>{await document.fonts.ready;continueRender(handle)}).catch(cancelRender);
}
