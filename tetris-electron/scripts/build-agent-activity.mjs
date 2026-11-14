import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
if(process.platform==='darwin') {
 const root=fileURLToPath(new URL('../',import.meta.url));
 const sdk=execFileSync('xcrun',['--sdk','macosx','--show-sdk-version'],{encoding:'utf8'}).trim();
 const [major,minor]=sdk.split('.').map(Number);
 if(major<27||(major===27&&minor<3))throw new Error(`原生 Mac Live Activities 需要 Xcode 27.3 或更新版本；当前 SDK ${sdk}。`);
 const source=join(root,'native/agent-activity');
 const contents=join(root,'resources/native/TetrisActivityHost.app/Contents');
 const widget=join(contents,'PlugIns/TetrisActivityWidget.appex/Contents');
 for(const p of [contents,widget])for(const sub of ['MacOS','Resources'])mkdirSync(join(p,sub),{recursive:true});
 const plist=value=>'<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>'+value+'</dict></plist>';
 const entry=(k,v)=>`<key>${k}</key><string>${v}</string>`;
 const info=(id,name,kind)=>entry('CFBundleIdentifier',id)+entry('CFBundleExecutable',name)+entry('CFBundleName',name)+entry('CFBundleDisplayName','Tetris Agents')+entry('CFBundlePackageType',kind)+entry('CFBundleVersion','1')+entry('CFBundleShortVersionString','1.0')+entry('LSMinimumSystemVersion','27.3');
 writeFileSync(join(contents,'Info.plist'),plist(info('com.collaborator.desktop.activities','TetrisActivityHost','APPL')+'<key>LSUIElement</key><true/><key>NSSupportsLiveActivities</key><true/>'));
 writeFileSync(join(widget,'Info.plist'),plist(info('com.collaborator.desktop.activities.widget','TetrisActivityWidget','XPC!')+'<key>NSExtension</key><dict>'+entry('NSExtensionPointIdentifier','com.apple.widgetkit-extension')+'</dict>'));
 const flags=['swiftc','-parse-as-library','-O','-swift-version','5','-target','arm64-apple-macos27.3',join(source,'AgentActivityAttributes.swift')];
 execFileSync('xcrun',[...flags,join(source,'Host.swift'),'-o',join(contents,'MacOS/TetrisActivityHost')],{stdio:'inherit'});
 execFileSync('xcrun',[...flags,'-application-extension',join(source,'AgentActivityWidget.swift'),'-o',join(widget,'MacOS/TetrisActivityWidget')],{stdio:'inherit'});
 const {default:sharp}=await import('sharp');
 for(const name of ['codex','claude-code','gpt','claude','glm','deepseek']){
  const file=join(root,`resources/dynamic-island/avatars/${name}.png`);
  const meta=await sharp(file).metadata();const size=Math.floor(meta.width/3);
  for(let cell=0;cell<3;cell++)await sharp(file).extract({left:cell*size,top:0,width:size,height:meta.height}).resize(44,44).png().toFile(join(widget,`Resources/${name}-${cell}.png`));
 }
 const entitlements=join(source,'Widget.entitlements');
 execFileSync('codesign',['--force','--sign','-','--entitlements',entitlements,join(contents,'PlugIns/TetrisActivityWidget.appex')],{stdio:'inherit'});
 execFileSync('codesign',['--force','--sign','-',join(root,'resources/native/TetrisActivityHost.app')],{stdio:'inherit'});
}
