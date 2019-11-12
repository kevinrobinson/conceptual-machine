import * as tf from '@tensorflow/tfjs';
import * as tmImage from '@teachablemachine/image';
import _ from 'lodash';

// can't get it's module and Rollbar to play nicely together
const { JSZip } = window;

const state = {
  projectZip: null
};


// function refresh() {
//   console.log('refresh', state);
// }

function debug(...params) {
  console.log(...params); // eslint-disable-line no-console
}

async function main() {
  document.querySelector('#upload-file-input').addEventListener('change', async e => {
    if (e.target.files.length === 0) return;
    const [file] = e.target.files;
    // state.projectZip = file;
    // refresh();


    const unzippedFiles = [];
    const jsZip = new JSZip();
    debug('Reading zip..');
    jsZip.loadAsync(file).then((zip) => {
      debug('reading...');
      zip.forEach((relativePath, zipEntry) => {
        debug('zipEntry', zipEntry);
        unzippedFiles.push(zipEntry);
      });
    });

    console.log('wat');
    function findZip(filename) {
      return _.find(unzippedFiles, (zip) => zip.name === filename);
    }

    async function readJson(zip) {
      return JSON.parse(await(zip.async('text')));
    }

    function readBinary(zip) {
      return zip.async('blob');
    }
    const modelJson = await readJson(findZip('model.json'));
    const metaDataJson = await readJson(findZip('metadata.json'));
    const weightsBin = await readBinary(findZip('weights.bin'));

    const model = await tmImage.loadFromFiles(modelJson, metaDataJson, weightsBin);
    console.log('model', model);
  });
}

main();
