/* Reuse already packaged models: no new texture/model download. Edition9 only. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GTAExamStreet=api;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const rows=[
[5016,'msk_panel',440,-988,12.015079379081726],
[5017,'msk_rushop',475,-990,13.262829542160034],
[5015,'msk_kiosk',518,-1030,12],
[5013,'msk_bench',478,-997,12.400554090738297],
[5013,'msk_bench',510,-1030,12.400554090738297],
[5012,'msk_lamp',465,-997,17.160576820373535],
[5012,'msk_lamp',492,-1030,17.160576820373535],
[5012,'msk_lamp',530,-997,17.160576820373535]
];
function install(FS){const path='/vc-assets/local/data/moscow.ipl',text=FS.readFile(path,{encoding:'utf8'});if(text.includes('# EGE STREET 15'))return false;if(!/\bend\s*$/.test(text))throw new Error('Unexpected map layout');const placed=rows.map(r=>[r[0],r[1],0,r[2],r[3],r[4],1,1,1,0,0,0,1].join(', ')).join('\n');FS.writeFile(path,text.replace(/\bend\s*$/,'# EGE STREET 15\n'+placed+'\nend\n'));return true;}
return {install,rows};
});
