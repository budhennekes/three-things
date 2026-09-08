// Preserve priorities from the local Electron test. Keep the original app data separate.
const {app}=require('electron'),fs=require('node:fs'),path=require('node:path');
const data=process.env.THREE_THINGS_TEST_DATA||path.join(app.getPath('appData'),'Three Things Local Test');
fs.mkdirSync(path.join(data,'Chromium'),{recursive:true});app.setPath('userData',data);app.setPath('sessionData',path.join(data,'Chromium'));
require('./main.cjs');
