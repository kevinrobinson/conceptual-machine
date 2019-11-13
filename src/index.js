console.log('dependencies', {JSZip, _, tmImage});

class App {
  constructor(el, els) {
    this.el = el;
    this.els = els;
    this.state = {
      project: null,
      model: null,
      generalization: null
    };
  }

  readState() {
    return _.clone(this.state);
  }

  update(newState) {
    this.state = {...this.state, ...newState};
    this.render();
  }

  render() {
    console.log('render');
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(this.state).length;
    this.els.log.appendChild(pre);
  }
}


function debug(...params) {
  console.log(...params); // eslint-disable-line no-console
}

async function setImageSrc(imgEl, src) {
  await new Promise((resolve, reject) => {
    imgEl.onload = resolve;
    imgEl.onerror = reject;
    imgEl.src = src;
  });
}

async function readBlobFromZip(zip, filename) {
  let zipEntry = null;
  zip.forEach((relativePath, entry) => {
    if (entry.name === filename) {
      zipEntry = entry;
    }
  });
  if (zipEntry === null) return;

  const fileData = await zipEntry.async('blob');
  return new File([fileData], filename);
}


async function loadImageModelFromZipFile(modelZipFile) {
  debug('Opening model zip...');
  const jsZip = new JSZip();
  const zip = await jsZip.loadAsync(modelZipFile);
  
  console.log('Loading model...');
  const model = await tmImage.loadFromFiles(
    await readBlobFromZip(zip, 'model.json'),
    await readBlobFromZip(zip, 'weights.bin'),
    await readBlobFromZip(zip, 'metadata.json')
  );
  console.log('Done.');
  return model;
}


/*
export declare interface TeachableMachineImageProject {
  manifest: TeachableMachineImageProjectManifest
  filesByClassName: {[className: string]: [blobUrl]}
}
*/
async function loadImageProjectFromZipFile(projectZipFile) {
  debug('Opening project zip...');
  const jsZip = new JSZip();
  const zip = await jsZip.loadAsync(projectZipFile);

  debug('Reading manifest.json...')
  let manifestEntry = null;
  zip.forEach((relativePath, entry) => {
    if (relativePath === 'manifest.json' && entry.name === 'manifest.json') {
      manifestEntry = entry;
    }
  });
  const manifest = (manifestEntry === null)
    ? null
    : JSON.parse(await manifestEntry.async('text'));
  debug(manifest ? '  manifest found' : '  manifest not found');

  // use a for loop for simple async/await usage
  debug('Reading image files...');
  const filesByClassName = {};
  for (var i = 0; i < Object.keys(zip.files).length; i++) {
    const relativePath = Object.keys(zip.files)[i];
    if (relativePath === 'manifest.json') continue;

    const [className, exampleNumber] = relativePath.split('-!-');
    filesByClassName[className] || (filesByClassName[className] = []);
    if (filesByClassName[className][exampleNumber] !== undefined) {
      console.warn('unexpected project file format');
    }

    const entry = zip.files[relativePath];
    const blob = await entry.async('blob');
    const blobUrl = URL.createObjectURL(blob);
    filesByClassName[className].push(blobUrl);
  };

  console.log('Done.');
  return {manifest, filesByClassName};
}

async function inspect(generalization, model, inspectorEl, deps) {
  const {createBarGraph} = deps;
  const project = generalization; // test against generalization

  // labels from model, classNames from project dataset
  const labels = model.getClassLabels();
  const classNames = Object.keys(project.filesByClassName);
  const sameLabelsAcrossDatasets = _.isEqual(labels.sort(), classNames.sort());
  await Promise.all(classNames.map(async className => {
    // for each class in model
    console.log('  inspect, className:', className);
    const classEl = document.createElement('div');
    classEl.classList.add('InspectClass');
    const titleEl = document.createElement('div');
    titleEl.classList.add('InspectClass-title');
    titleEl.textContent = className;

    // add all images and the model prediction for that image
    const imageBlobUrls = project.filesByClassName[className] || [];
    console.log('    imageBlobUrls.length', imageBlobUrls.length);
    await Promise.all(imageBlobUrls.map(async (blobUrl, index) => {
      const exampleEl = document.createElement('div');
      exampleEl.classList.add('InspectExample');

      console.log('    index:', index);
      const imgEl = document.createElement('img');
      imgEl.classList.add('InspectExample-img');
      imgEl.title = index;
      exampleEl.appendChild(imgEl);
      await setImageSrc(imgEl, blobUrl); // before predicting

      const labelEl = document.createElement('div');
      labelEl.classList.add('InspectExample-label');
      labelEl.textContent = className;
      exampleEl.appendChild(labelEl);

      const predictionEl = document.createElement('div');
      predictionEl.classList.add('InspectExample-prediction');
      predictionEl.classList.add('graph-wrapper');
      const predictions = await model.predict(imgEl);
      // const prediction = _.last(_.sortBy(predictions, 'probability'));
      // predictionEl.textContent = `model says: ${prediction.className}, ${Math.round(100*prediction.probability)}%`;
      console.log('create', predictionEl, labels, predictions);
      const fn = await createBarGraph(predictionEl, labels, predictions);
      console.log('fn', fn);
      exampleEl.appendChild(predictionEl);

      // only highlight if model labels and dataset labels match
      if (sameLabelsAcrossDatasets) {
        const prediction = _.last(_.sortBy(predictions, 'probability'));
        if (className === prediction.className) {
          exampleEl.classList.add('InspectExample-prediction-does-match');
        } else {
          exampleEl.classList.add('InspectExample-prediction-does-not-match');
        }
      }
      classEl.appendChild(exampleEl);
    }));

    inspectorEl.appendChild(classEl);
  }));
}


export async function main(deps) {
  const els = {
    modelZipInput: document.querySelector('#upload-model-zip-input'),
    projectZipInput: document.querySelector('#upload-project-zip-input'),
    generalizationZipInput: document.querySelector('#upload-generalization-zip-input'),
    inspectButton: document.querySelector('#inspect-button'),
    log: document.querySelector('#log'),
    inspection: document.querySelector('#inspection')
  }
  const app = new App(document.body, els);
  window.app = app; //debug


  els.modelZipInput.addEventListener('change', async e => {
    if (e.target.files.length === 0) return;
    const [modelZip] = e.target.files;
    const model = await loadImageModelFromZipFile(modelZip);
    app.update({model});
  });

  els.projectZipInput.addEventListener('change', async e => {
    if (e.target.files.length === 0) return;
    const [projectZip] = e.target.files;
    const project = await loadImageProjectFromZipFile(projectZip);
    app.update({project});
  });

  els.generalizationZipInput.addEventListener('change', async e => {
    if (e.target.files.length === 0) return;
    const [projectZip] = e.target.files;
    const generalization = await loadImageProjectFromZipFile(projectZip);
    app.update({generalization});
  });


  els.inspectButton.addEventListener('click', async e => {
    const {model, generalization} = app.readState();
    if (!model || !generalization) return;

    await inspect(generalization, model, els.inspection, deps);
  });
}
