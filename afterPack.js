const { execFileSync } = require('child_process');
const path = require('path');

module.exports = async function(context) {
    if (context.electronPlatformName !== 'win32') return;
    const appExe  = path.join(context.appOutDir, `${context.packager.appInfo.productName}.exe`);
    const iconPath = path.join(__dirname, 'build', 'icon.ico');
    const rcedit   = path.join(__dirname, 'rcedit.exe');
    execFileSync(rcedit, [appExe, '--set-icon', iconPath, '--set-subsystem', 'windows']);
    console.log('  • icon + no-console applied to', path.basename(appExe));
};
