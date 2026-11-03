import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const app=resolve('../tetris-electron');
const require=createRequire(app+'/package.json');
const {createServer}=await import(createRequire(require.resolve('electron-vite')).resolve('vite'));
const server=await createServer({configFile:false,root:resolve('fixtures'),resolve:{alias:{'@tetris/shared':app+'/packages/shared/src','@tetris/components':app+'/packages/components/src','react':app+'/node_modules/react','react-dom':app+'/node_modules/react-dom','@xterm/xterm':app+'/node_modules/@xterm/xterm'}},server:{host:'127.0.0.1',port:4317,fs:{allow:[resolve('..')]}}});await server.listen();server.printUrls();
