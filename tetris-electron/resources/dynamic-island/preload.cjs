const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('island',{
 subscribe:callback=>{const listener=(_,state)=>callback(state);ipcRenderer.on('island:state',listener);return()=>ipcRenderer.removeListener('island:state',listener)},
 expand:value=>ipcRenderer.send('island:expand',Boolean(value)),
 height:value=>ipcRenderer.send('island:height',value),
 drag:(phase,x,y)=>ipcRenderer.send('island:drag',phase,x,y),
 copyKey:id=>ipcRenderer.invoke('island:copy-key',id),
 refresh:()=>ipcRenderer.send('island:refresh'),
 close:()=>ipcRenderer.send('island:close'),
 open:id=>ipcRenderer.send('island:open',id),
});
