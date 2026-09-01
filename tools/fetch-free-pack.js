/* Сборка бесплатного пака моделей (pack/) из источников CC0.
 *
 *   node tools/fetch-free-pack.js      (нужен интернет)
 *
 * Модели — Quaternius «Animated Fish Bundle» + кальмар, все CC0, с poly.pizza
 * (CDN static.poly.pizza). Скрипт качает GLB, раскладывает по pack/<вид>/ как
 * <вид>.gltf (GLTFLoader понимает GLB по сигнатуре, расширение не важно) и
 * собирает pack.json: рифовые виды из манифеста получают обобщённое рыбье тело,
 * акула/скат/кальмар — свою модель. Пак в git не идёт (см. .gitignore), но так
 * его можно восстановить в любой момент, а не терять при чистом клоне.
 */
'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PACK = path.join(ROOT, 'pack');

// имя файла модели -> uuid на static.poly.pizza (CC0)
const SRC = {
  clownfish: '311a79f6-ba3e-47aa-80ce-04185fc76b2a',
  bluetang:  '6805b99c-5fd7-4aab-bf57-3bb645e1108a',
  browntang: '8410757e-6594-4011-817a-633730fbcaf8',
  shark:     'd2d374ea-eb1d-4659-8cc7-816a83b82470',
  mantaray:  '32b4e08e-4605-4356-8bd3-e0cf32335a0f',
  squid:     '266ac4c8-49f4-4564-b913-1530e16767ea',
  turtle:    '4a6957fa-543c-4e64-b6cf-7e9d5523026a',
  jellyfish: '1067b274-0eed-4ccb-adfe-1896d430be00',
  seahorse:  '4f2c1b38-3bcd-460f-9981-49672bdc1aa0'
};

function dl(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        r.resume();
        return dl(r.headers.location, dest).then(resolve, reject);
      }
      if (r.statusCode !== 200) { r.resume(); return reject(new Error(url + ' -> ' + r.statusCode)); }
      const f = fs.createWriteStream(dest);
      r.pipe(f);
      f.on('finish', () => f.close(resolve));
      f.on('error', reject);
    }).on('error', reject);
  });
}

(async () => {
  fs.mkdirSync(PACK, { recursive: true });
  for (const [name, uuid] of Object.entries(SRC)) {
    const dir = path.join(PACK, name);
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, name + '.gltf');
    await dl('https://static.poly.pizza/' + uuid + '.glb', dest);
    const buf = fs.readFileSync(dest).slice(0, 4).toString('latin1');
    if (buf !== 'glTF') throw new Error(name + ': не GLB (сигнатура ' + buf + ')');
    console.log('ok', name, fs.statSync(dest).size, 'b');
  }

  // pack.json из манифеста раскрасок: рифовые виды -> обобщённые рыбьи тела
  // (своих CC0-моделей под каждый риф-вид пока нет), акула/скат/кальмар — свои.
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/coloring/manifest.json'), 'utf8').replace(/^﻿/, ''));
  const url = (n) => '/assets/models/pack/' + n + '/' + n + '.gltf';
  const bodies = ['clownfish', 'bluetang', 'browntang'];
  const own = { shark: 'shark', mantaray: 'mantaray', squid: 'squid', turtle: 'turtle', jellyfish: 'jellyfish', seahorse: 'seahorse' };
  const list = m.fish.map((f, i) => ({ name: f.name, title: f.title || f.name, url: url(own[f.name] || bodies[i % bodies.length]) }));
  fs.writeFileSync(path.join(PACK, 'pack.json'), JSON.stringify(list, null, 2));
  fs.writeFileSync(path.join(PACK, 'NOTICE.txt'),
    'Модели: Quaternius Animated Fish Bundle + Squid (poly.pizza), лицензия CC0.\n' +
    'Пересобрать: node tools/fetch-free-pack.js\n');
  console.log('pack.json:', list.length, 'видов — готово');
})().catch((e) => { console.error('ошибка:', e.message); process.exit(1); });
