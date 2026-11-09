'use strict';

const {Worker, isMainThread, parentPort, workerData} = require('node:worker_threads');
function readWorkbook(bytes, format) {
  if (bytes.length < 4 || bytes.length > 3 * 1024 * 1024 || bytes.readUInt32LE(0) !== 0x04034b50) throw Error('Selecione um ficheiro .xlsx válido até 3 MB.');
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {workerData:{bytes, format}, resourceLimits:{maxOldGenerationSizeMb:96}});
    const timer = setTimeout(() => {
      reject(Error('O ficheiro excede o tempo de leitura permitido.'));
      worker.terminate();
    }, 15000);
    worker.on('message', message => {
      if (message?.type === 'workbook-ready') resolve(message.data);
      if (message?.type === 'workbook-error') reject(Error(message.error));
    });
    worker.once('error', () => reject(Error('O ficheiro excede os recursos de leitura disponíveis.')));
    worker.once('exit', () => {
      clearTimeout(timer);
      reject(Error('A leitura do ficheiro terminou sem devolver dados.'));
    });
  });
}
module.exports = {readWorkbook};

if (!isMainThread && require.main === module) {
  (async () => {
    let sheets;
    try { sheets = await require('read-excel-file/node').default(Buffer.from(workerData.bytes)); }
    catch { throw Error('Não foi possível ler o ficheiro .xlsx. Verifique o formato e se está protegido.'); }
    const data = workerData.format === 'catalog'
      ? require('./estimate-catalog.cjs').buildCatalog(sheets)
      : require('./company-import.cjs').readRows(sheets);
    parentPort.postMessage({type:'workbook-ready', data});
  })().catch(error => parentPort.postMessage({type:'workbook-error', error:error.message}));
}
