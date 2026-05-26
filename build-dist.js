/**
 * build-dist.js — защищённая сборка
 * Обфускирует JS перед упаковкой, потом восстанавливает оригиналы.
 * Запуск: npm run dist
 */

const JavaScriptObfuscator = require('javascript-obfuscator');
const { execSync } = require('child_process');
const fs = require('fs');
const { GH_TOKEN } = require('./config');

const FILES = ['renderer.js', 'main.js'];

const OBF_OPTIONS = {
    compact:                          true,
    controlFlowFlattening:            false,   // false — быстрее запуск
    deadCodeInjection:                false,
    debugProtection:                  false,
    disableConsoleOutput:             false,
    identifierNamesGenerator:         'hexadecimal',
    renameGlobals:                    false,
    rotateStringArray:                true,
    selfDefending:                    false,
    shuffleStringArray:               true,
    splitStrings:                     false,
    stringArray:                      true,
    stringArrayCallsTransform:        true,
    stringArrayEncoding:              ['base64'],
    stringArrayIndexShift:            true,
    stringArrayRotate:                true,
    stringArrayShuffle:               true,
    stringArrayWrappersCount:         2,
    stringArrayWrappersType:          'function',
    stringArrayThreshold:             0.75,
    unicodeEscapeSequence:            false
};

console.log('\n🔒 Обфускация исходного кода...\n');

// Сохраняем оригиналы
FILES.forEach(f => {
    fs.copyFileSync(f, f + '.orig');
    const code   = fs.readFileSync(f, 'utf8');
    const result = JavaScriptObfuscator.obfuscate(code, OBF_OPTIONS);
    fs.writeFileSync(f, result.getObfuscatedCode());
    console.log(`  ✓  ${f} зашифрован`);
});

console.log('\n📦 Сборка установщика...\n');

// Флаг --publish always = загрузить релиз на GitHub
const publishFlag = process.argv.includes('--publish') ? ' --publish always' : '';

try {
    execSync(`npx electron-builder --win --x64${publishFlag}`, {
        stdio: 'inherit',
        env: { ...process.env, GH_TOKEN }
    });
    console.log('\n✅ Готово — установщик в папке dist/');
} catch (err) {
    console.error('\n❌ Ошибка сборки:', err.message);
} finally {
    // Восстанавливаем оригиналы в любом случае
    FILES.forEach(f => {
        const bak = f + '.orig';
        if (fs.existsSync(bak)) {
            fs.copyFileSync(bak, f);
            fs.unlinkSync(bak);
        }
    });
    console.log('🔓 Оригиналы восстановлены\n');
}
