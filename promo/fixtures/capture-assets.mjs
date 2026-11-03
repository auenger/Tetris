// Run with: ego-browser nodejs < /absolute/path/to/promo/fixtures/capture-assets.mjs
// Start fixtures/server.mjs from promo/ first. Uses only synthetic local content.
const task=await taskSpace('Tetris 素材采集');
const page=task.page('p1');
const fs=await import('node:fs/promises');
const output='/Users/ryan/mycode/collab/promo/public/v2';
await page.goto('http://127.0.0.1:4317');
await page.waitForFunction(()=>window.ready);
await page.cdp('Emulation.setDeviceMetricsOverride',{width:1000,height:700,deviceScaleFactor:2,mobile:false});
for(const kind of ['term0','term1','term2','term3','term4','term5','doc','image','browser']){
  const dim=await page.evaluate(kind=>window.showAsset(kind),kind);
  const shot=await page.cdp('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:true,clip:{x:0,y:0,width:dim.w,height:dim.h,scale:2}});
  await fs.writeFile(output+'/'+kind+'.png',Buffer.from(shot.data,'base64'));
  console.log(kind);
}
await task.finish({keep:[]});
