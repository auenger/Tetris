import {test,expect} from 'bun:test';
import {readTerminalClipboard} from './terminal-clipboard';
const clipboard=(image:boolean,text='',url='')=>({readImage:()=>({isEmpty:()=>!image}),readText:()=>text,read:()=>url});
test('native image takes priority over accompanying text',()=>{
 expect(readTerminalClipboard(clipboard(true,'image caption'))).toEqual({kind:'image'});
});
test('Finder image file uses original native clipboard; no path is pasted',()=>{
 expect(readTerminalClipboard(clipboard(false,'','file:///tmp/Screen%20Shot.PNG'))).toEqual({kind:'image'});
});
test('text, empty clipboard and non-image URLs stay text',()=>{
 expect(readTerminalClipboard(clipboard(false,'one\ntwo'))).toEqual({kind:'text',text:'one\ntwo'});
 expect(readTerminalClipboard(clipboard(false))).toEqual({kind:'text',text:''});
 expect(readTerminalClipboard(clipboard(false,'notes.txt','file:///tmp/notes.txt'))).toEqual({kind:'text',text:'notes.txt'});
});
