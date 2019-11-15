// console.log('dependencies', {JSZip, _, tmImage, UMAP, ScatterGL});
// shim
const seedrandom = Math.seedrandom;

const RANDOM_SEED = 42;
console.log('RANDOM_SEED', RANDOM_SEED);

function debug(...params) {
  console.log(...params); // eslint-disable-line no-console
}

function loudLog(...params) {
  console.log(...params);
  const line = document.createElement('pre');
  line.textContent = params.map(p => typeof p === 'string' ? p : JSON.stringify(p)).join('  ');
  document.querySelector('#log').style.display = 'block';
  document.querySelector('#log').appendChild(line);
}

class App {
  constructor(el, els) {
    this.el = el;
    this.els = els;
    this.state = {
      training: null,
      model: null,
      concepts: null
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
    const {training, model, concepts} = this.state;


    if (training) {
      this.els.trainingStatus.textContent = 'ready!';
    }
    if (model) {
      this.els.modelStatus.textContent = 'ready!';
    }
    if (concepts) {
      this.els.conceptsStatus.textContent = 'ready!';
    }

    // buttons
    const canAnalyze = (training && model && concepts);
    this.els.tcavButton.disabled = !canAnalyze;
  }
}


async function setImageSrc(imgEl, src) {
  await new Promise((resolve, reject) => {
    imgEl.onload = resolve;
    imgEl.onerror = reject;
    imgEl.src = src;
  });
}

async function imageFromUri(src) {
  const imgEl = document.createElement('img');
  await new Promise((resolve, reject) => {
    imgEl.onload = resolve;
    imgEl.onerror = reject;
    imgEl.src = src;
  });
  return imgEl;
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
  inspectorEl.innerHTML = '';
  const labels = model.getClassLabels();
  const classNames = Object.keys(project.filesByClassName);
  const sameLabelsAcrossDatasets = _.isEqual(labels.sort(), classNames.sort());
  await Promise.all(classNames.map(async className => {
    // for each class in model
    console.log('  inspect, className:', className);
    const classEl = document.createElement('div');
    classEl.classList.add('InspectClass');
    const titleEl = document.createElement('h2');
    titleEl.classList.add('InspectClass-title');
    titleEl.textContent = `Generalization label: ${className}`;
    classEl.appendChild(titleEl);

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
      const fn = await createBarGraph(predictionEl, labels, predictions);
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



// This is dependent on how the TM image model
// is constructed by the training process.  It's
// two layers - a truncated MobileNet to get embeddings,
// with a smaller trained model on top.  That trained
// model has two layers itself - a dense layer and a softmax
// layer.
//
// So we get the trained model first, then within
// there we apply the second-to-last layer to get
// embeddings.
//
// In other words, take the last sofmax layer off
// the last layer.
function infer(tmImageModel, raster) {
  const tfModel = tmImageModel.model;
  const seq = tf.sequential();
  seq.add(_.first(tfModel.layers)); // mobilenet
  seq.add(_.first(_.last(tfModel.layers).layers)); // dense layer, without softmax
  return seq.predict(capture(raster));
}

function inferMobileNet(tmImageModel, raster) {
  const tfModel = tmImageModel.model;
  const seq = tf.sequential();
  seq.add(_.first(tfModel.layers)); // mobilenet embeddings only
  return seq.predict(capture(raster));
}

// doesn't work, just grabbing dense layer already has inbound
// connections from previous
function inferFromMobileNetEmbedding(tmImageModel, mobileNetEmbedding) {
  const tfModel = tmImageModel.model;

  // try to just rewire
  // const denseLayer = _.first(_.last(tfModel.layers).layers);
  // denseLayer.inboundNodes = [];
  // const seq2 = tf.sequential();
  // seq2.add(denseLayer); // mobilenet embeddings only
  // return seq.predict(mobileNetEmbedding);

  // try to rebuild from config and weights
  const denseLayer = _.first(_.last(tfModel.layers).layers);
  const rewiredDenseLayer = tf.layers.dense({
    ...denseLayer.getConfig(),
    inputShape: [null, 1280]
  });
  // rewiredDenseLayer.build();
  // doesn't work
  // rewiredDenseLayer.setWeights(denseLayer.getWeights());
  const seq = tf.sequential({
    layers: [rewiredDenseLayer]
  });
  return seq.predict(mobileNetEmbedding);
}

// copied
function capture(rasterElement) {
    return tf.tidy(() => {
        const pixels = tf.browser.fromPixels(rasterElement);

        // crop the image so we're using the center square
        const cropped = cropTensor(pixels);

        // Expand the outer most dimension so we have a batch size of 1
        const batchedImage = cropped.expandDims(0);

        // Normalize the image between -1 and a1. The image comes in between 0-255
        // so we divide by 127 and subtract 1.
        return batchedImage.toFloat().div(tf.scalar(127)).sub(tf.scalar(1));
    });
}

// copied
function cropTensor(img) {
    const size = Math.min(img.shape[0], img.shape[1]);
    const centerHeight = img.shape[0] / 2;
    const beginHeight = centerHeight - (size / 2);
    const centerWidth = img.shape[1] / 2;
    const beginWidth = centerWidth - (size / 2);
    return img.slice([beginHeight, beginWidth, 0], [size, size, 3]);
}


async function embeddings(generalization, model, el, options = {}) {
  // clear, show waiting
  el.innerHTML = '';
  const waitingEl = document.createElement('div');
  waitingEl.classList.add('Status');
  waitingEl.textContent = 'working...';
  el.appendChild(waitingEl);

  debug('Starting embeddings...');
  const examples = await mapExamples(generalization, async (className, blobUrl, index) => {
    const imgEl = document.createElement('img');
    await setImageSrc(imgEl, blobUrl);
    const predictions = await model.predict(imgEl);
    return {className, index, predictions, blobUrl};
  });
  const embeddingsList = await mapExamples(generalization, async (className, blobUrl, index) => {
    const imgEl = document.createElement('img');
    await setImageSrc(imgEl, blobUrl);
    return (await infer(model, imgEl)).dataSync();
  });
  const baseEmbeddingsList = await mapExamples(generalization, async (className, blobUrl, index) => {
    const imgEl = document.createElement('img');
    await setImageSrc(imgEl, blobUrl);
    return (await inferMobileNet(model, imgEl)).dataSync();
  });

    //localStorage.setItem('examples', JSON.stringify(examples));localStorage.setItem('embeddingsList', JSON.stringify(embeddingsList));
  window.useProjector = useProjector;
  window.baseEmbeddingsList = baseEmbeddingsList;
  window.embeddingsList = embeddingsList;
  window.examples = examples;


  // grid in mobilenet space, mapped to TM space, to see warping
  const showGrid = false
  if (showGrid) {
    console.log('  grid points...');
    const vals = _.range(-5, 5, 1).map(n => n/100);
    const gridPoints = vals.map(v => _.range(0, 1280).map(i => v));
    const gridTransforms = await Promise.all(gridPoints.map(async p => {
      return (await inferFromMobileNetEmbedding(model, tf.tensor([p]))).dataSync();
    }));
    window.gridPoints = gridPoints;
    window.gridTransforms = gridTransforms;

    // useProjector(baseEl, baseEmbeddingsList, examples, gridPoints, options);
    // useProjector(trainedEl, embeddingsList, examples, gridTransforms, options);
  }


  debug('Projecting with UMAP...');
  // older: projectWithUmap(el, embeddingsList);


  // for multiple
  const baseEl = document.createElement('div');
  const trainedEl = document.createElement('div');
  const movementEl = document.createElement('div');
  [baseEl, trainedEl].forEach(element => {
    element.classList.add('Projector');
    el.appendChild(element);
  });

  // base, trained
  const prng = new Prando(RANDOM_SEED);
  const random = () => prng.next();
  // order of merging matters here
  const projectorOptions = {
    sprites: false,
    color: true,
    ...options,
    umap: {
      random, // fix seed for determinism
      nComponents: 2,
      ...(options.umap || {})
    }, 
  };
  useProjector(baseEl, baseEmbeddingsList, examples, {...projectorOptions, title: 'Embeddings from MobileNet'});
  useProjector(trainedEl, embeddingsList, examples, {...projectorOptions, title: 'Embeddings from your model'});

  // show movement in same (fake) space
  const showMovement = false;
  if (showMovement) {
    const movementEmbeddings = baseEmbeddingsList.concat(embeddingsList);
    const sequences = baseEmbeddingsList.map((embedding, index) => {
      return {
        indices: [index, index + baseEmbeddingsList.length]
      };
    });
    useProjector(movementEl, movementEmbeddings, examples.concat(examples), {...options, sequences});
  }
  
  el.removeChild(waitingEl);
  debug('Done.');
}

async function forEachExample(project, asyncFn) {
  mapExamples(project, async (className, blobUrl, index) => {
    await asyncFn(className, blobUrl, index);
    return undefined;
  });
  return undefined;
}

async function mapExamples(project, asyncFn) {
  const classNames = Object.keys(project.filesByClassName);
  let mapped = [];
  for (var i = 0; i < classNames.length; i++) {
    let className = classNames[i];
    let imageBlobUrls = project.filesByClassName[className] || [];
    for (var j = 0; j < imageBlobUrls.length; j++) {
      let value = await asyncFn(className, imageBlobUrls[j], j);
      mapped.push(value);
    }
  }
  return mapped;
}




// needs more than n=15 by default
// async function projectWithUmap(el, embeddingsList) {
//   console.log('projectWithUmap', embeddingsList.length);
//   const umap = new UMAP();
//   console.log('fitting', umap);
//   const xys = await umap.fitAsync(embeddingsList);
//   console.log('xys', xys);
//   const xDomain = [_.min(xys.map(xy => xy[0])), _.max(xys.map(xy => xy[0]))];
//   const yDomain = [_.min(xys.map(xy => xy[1])), _.max(xys.map(xy => xy[1]))];
//   console.log('xDomain', xDomain);
//   console.log('yDomain', yDomain);
  
//   var xScale = d3.scaleLinear()
//       .domain(xDomain)
//       .range([ 0, 800 ]);
//   var yScale = d3.scaleLinear()
//       .domain(yDomain)
//       .range([ 0, 600 ]);
//   const ns = "http://www.w3.org/2000/svg";
//   const svg = document.createElementNS(ns, 'svg');
//   svg.setAttribute('width', 800);
//   svg.setAttribute('height', 600);
//   svg.style.width = '800px';
//   svg.style.height = '600px';
  
//   console.log('projected', xys.map(xy => [xScale(xy[0]), yScale(xy[1])]));
//   xys.forEach((xy, index) => {
//     const [x, y] = xy;
//     const circle = document.createElementNS(ns, 'circle');
//     circle.setAttribute('cx', xScale(x));
//     circle.setAttribute('cy', yScale(y));
//     circle.setAttribute('r', 5);
//     const i = Math.round(index / xys.length * 16);
//     circle.setAttribute('fill', `#ff${i.toString(16)}`); // rgb didn't work, even in web inspector? confused, but working around...
//     svg.appendChild(circle);
//   });
//   el.appendChild(svg);
// }


async function useProjector(el, embeddingsList, examples, options = {}) {
  // project
  debug('useProjector');
  const umap = new UMAP(options.umap || {});
  debug('  fitting...', options.umap || {});
  const xys = await umap.fitAsync(embeddingsList);

  // reshape for scatterplot
  // metadata is for `showLabelsOnHover`
  const metadata = examples.map((example, i) => {
      const generalizationClassName = examples[i].className;
      const prediction = _.last(_.sortBy(examples[i].predictions, 'probability'));
      const predictedClassName = prediction.className;
      const label = (generalizationClassName === predictedClassName)
        ? `${Math.round(100*prediction.probability)}% ${example.predictions[0].className}`
        : `${Math.round(100*prediction.probability)}% ${example.predictions[0].className} (mislabeled)`;
    return {label};
    // p: example.prediction.probability,
    // label: example.className
    // label: example.prediction.probability
    // label: `${Math.round(100*example.predictions[0].probability)}% ${example.predictions[0].className}`
  });

  return await projectScatterplot(el, xys, metadata, options);
}

async function projectScatterplot(el, xys, metadata, options = {}) {
  console.log('projectScatterplot', el, xys, metadata, options);
  const dataset = new ScatterGL.Dataset(xys, metadata);

   // window.xys = xys;
  //  localStorage.setItem('xys', JSON.stringify(xys));
  // console.log('xys', xys);

  debug('  rendering...');
  
  // create spritesheet and attach to dataset
  if (options.sprites) {
    const sprites = metadata.map(example => {
      return {uri: example.blobUrl}
    });
    const SPRITE_SHEET_SIZE = 64;
    const spriteSheetImgEl = await createSpriteSheetForScatterplot(sprites, SPRITE_SHEET_SIZE, SPRITE_SHEET_SIZE, {opacity: 0.5});
     console.log('spriteSheetImgEl', spriteSheetImgEl);
    dataset.setSpriteMetadata({
      spriteImage: spriteSheetImgEl,
      singleSpriteSize: [SPRITE_SHEET_SIZE, SPRITE_SHEET_SIZE],
    });
    console.log('spriteMetadata', dataset.spriteMetadata);
  }


  // layout
  const titleEl = document.createElement('h2');
  titleEl.textContent = options.title || 'UMAP projection';
  el.appendChild(titleEl);
  const containerEl = document.createElement('div');
  containerEl.classList.add('Projector-content');
  el.appendChild(containerEl);
  const messageEl = document.createElement('div');
  messageEl.classList.add('Projector-message');
  el.appendChild(messageEl);

  // config
  const scatterGL = new ScatterGL(containerEl, {
    // renderMode: (dataset.spriteMetadata) ? 'SPRITE' : 'POINT',
    onHover: (index) => {
      const d = (index === null ) ? null : {
        meta: metadata[index]
      };
      renderHoverMessage(messageEl, d);
    },
    showLabelsOnHover: true, // requires `label` metadata
    selectEnabled: false,
    rotateOnStart: false
    // onSelect: (points) => {
    //   let message = '';
    //   if (points.length === 0 && lastSelectedPoints.length === 0) {
    //     message = '🔥 no selection';
    //   } else if (points.length === 0 && lastSelectedPoints.length > 0) {
    //     message = '🔥 deselected';
    //   } else if (points.length === 1) {
    //     message = `🔥 selected ${points}`;
    //   } else {
    //     message = `🔥selected ${points.length} points`;
    //   }
    //   messageEl.textContent = message;
    // }
  });

  // coloring, tied to number of classes
  if (options.simpleColor) {
    scatterGL.setPointColorer(i => {
      const predictions = metadata[i].predictions;
      if (!predictions) return '#333';

      const prediction = _.last(_.sortBy(predictions, 'probability'));
      const classIndex = predictions.indexOf(prediction);
      // const nClasses = predictions.length;
      // const hues = [...new Array(nClasses)].map((_, i) => Math.floor((255 / nClasses) * classIndex));
      // const colorsByLabel = hues.map(hue => `hsl(${hue}, 100%, 50%)`);
      // const colorsByLabel = ['#f59322', '#0877bd'];
      const colorsByLabel = ['rgb(0, 105, 92)', '#f59322'];
      return colorsByLabel[classIndex];
    });
  }
  if (options.color) {
    // highlight midlines
    scatterGL.setPointColorer(i => {
      // truth, predicted
      // if (i >= examples.length) return '#999'; // grid
      const generalizationClassName = metadata[i].className;
      const prediction = _.last(_.sortBy(metadata[i].predictions, 'probability'));
      const predictedClassName = prediction.className;
      const hue = (generalizationClassName === predictedClassName) ? 120 : 0;

      return `hsl(${hue}, 100%, ${100 - Math.round(50*prediction.probability)}%)`;
    });

    // alt colors, from tf playground
    // #f59322
    // #e8eaeb
    // #0877bd

    // const labels = _.uniq(examples.map(ex => ex.className)).sort();
    // const CLASSES_COUNT = labels.length*2;
    // const hues = [...new Array(CLASSES_COUNT)].map((_, i) => Math.floor((255 / CLASSES_COUNT) * i));
    // const colorsByLabel = hues.map(hue => `hsl(${hue}, 100%, 30%)`);
    // scatterGL.setPointColorer(i => {
    //   // truth, predicted
    //   const generalizationClassName = examples[i].className;
    //   const predictedClassName = _.last(_.sortBy(examples[i].predictions, 'probability')).className;

    //   const labelIndex = labels.indexOf(generalizationClassName);
    //   const offset = (generalizationClassName === predictedClassName) ? labels.length : 0;
    //   return colorsByLabel[labelIndex + offset];
    // });
  }

  // sequences
  console.log('options.sequences', options.sequences);
  scatterGL.setSequences(options.sequences || []);

  // controls
  scatterGL.setPanMode();

  // dimensions
  scatterGL.setDimensions((options.umap || {}).nComponents || 2);
  console.log('  rendering...');
  // actual render
  scatterGL.render(dataset);
  messageEl.innerHTML = '<div class="Hover" />Hover to see more</div>';

  // seems to have to come after, maybe a bug?
  if (dataset.spriteMetadata) {
    scatterGL.setSpriteRenderMode();
  }

  window.scatterGL = scatterGL;
  window.dataset = dataset;
}





// items is [{uri}]
// img element
async function createSpriteSheetForScatterplot(items, width, height, options = {}) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  context.globalAlpha = options.opacity || 1.0;
  console.log('context.globalAlpha', context.globalAlpha);

  const cols = Math.ceil(Math.sqrt(items.length));
  canvas.width = cols * width;
  canvas.height = cols * width;
  await Promise.all(items.map((item, index) => {
    const x = width * (index % cols);
    const y = height * Math.floor(index / cols);
    const img = new Image();
    return new Promise(function(resolve, reject) {
      img.onload = function() {
        context.drawImage(img, x, y, width, height);
        resolve();
      };
      img.crossOrigin = 'Anonymous';
      img.src = item.uri;
    });
  }));
  
  const uri = canvas.toDataURL();
  const img = document.createElement('img');
  img.width = canvas.width;
  img.height = canvas.height;
  img.src = uri;
  return img;
}

function renderHoverMessage(el, data) {
  // don't destroy on hover out
  if (data === null) {
    el.style.opacity = 0.5;
    return;
  }

  const {meta} = data;
  const {uri} = meta;
  el.innerHTML = `
    <div class="Hover">
      <div><img class="Hover-img" width="224" height="224" /></div>
      <div class="Hover-info">
        <div class="Hover-id"></div>
        <pre class="Hover-debug"></pre>
      </div>
    </div>
  `;
  el.style.opacity = 1.0;
  el.querySelector('.Hover-img').src = uri;
  // el.querySelector('.Hover-id').textContent = `id: ${id}`;
  el.querySelector('.Hover-debug').textContent = JSON.stringify(meta, null, 2);
  return;
}


function addWaitingEl(el) {
  const waitingEl = document.createElement('div');
  waitingEl.classList.add('Status');
  waitingEl.textContent = 'working...'
  el.appendChild(waitingEl);
  return () => el.removeChild(waitingEl);
}


export async function main(deps) {
  const els = {
    trainingZipInput: document.querySelector('#training-zip-input'),
    trainingStatus: document.querySelector('#training-status'),

    modelZipInput: document.querySelector('#model-zip-input'),
    modelStatus: document.querySelector('#model-status'),

    conceptsZipInput: document.querySelector('#concepts-zip-input'),
    conceptsStatus: document.querySelector('#concepts-status'),

    tcavButton: document.querySelector('#tcav-button'),

    workspace: document.querySelector('#workspace'),
    log: document.querySelector('#log'),
    visorButton: document.querySelector('#visor-button')
  }
  const app = new App(document.body, els);
  window.app = app; //debug
  app.render();


  els.trainingZipInput.addEventListener('change', async e => {
    if (e.target.files.length === 0) return;
    els.trainingStatus.textContent = 'loading...';
    const [trainingZip] = e.target.files;
    const training = await loadImageProjectFromZipFile(trainingZip);
    app.update({training});
  });

  els.modelZipInput.addEventListener('change', async e => {
    if (e.target.files.length === 0) return;
    els.modelStatus.textContent = 'loading...';
    const [modelZip] = e.target.files;
    const model = await loadImageModelFromZipFile(modelZip);
    app.update({model});
  });

  els.conceptsZipInput.addEventListener('change', async e => {
    if (e.target.files.length === 0) return;
    els.conceptsStatus.textContent = 'loading...';
    const [conceptsZip] = e.target.files;
    const concepts = await loadImageProjectFromZipFile(conceptsZip);
    app.update({concepts});
  });

  // els.visorButton.addEventListener('click', e => tfvis.visor());
  els.tcavButton.addEventListener('click', async e => {
    const {training, model, concepts} = app.readState();
    if (!training || !model || !concepts) return;
    const done = addWaitingEl(els.workspace);
    await tcav(model, training, concepts, els.workspace, deps);
    done();
  });
}



// `examples`` is [[Array, Array, ...], [Array, Array, ...]]
// so list of classes, then the list of examples in that class.
// these should be concretized activations, not Tensor objects.
// ultimately returns two `tf.data dataset` objects.
/**
 * Process the examples by first shuffling randomly per class, then adding
 * one-hot labels, then splitting into training/validation datsets, and finally
 * sorting one last time
 */
function convertToTfDataset(examples) {
  // TM code expects seed to be a seedrandom fn
  const seed = seedrandom(RANDOM_SEED);
  const validationFraction = 0.15;
  const nClasses = examples.length;

  // first shuffle each class individually
  for (let i = 0; i < examples.length; i++) {
    examples[i] = fisherYates(examples[i], seed);
  }
  loudLog('sorted', examples);

  // then break into validation and test datasets
  let trainDataset = [];
  let validationDataset = [];

  // for each class, add samples to train and validation dataset
  for (let i = 0; i < examples.length; i++) {
    loudLog('examples[i], i:', i);
    const y = flatOneHot(i, nClasses);

    const nExamplesInClass = examples[i].length;
    const numValidation = Math.ceil(validationFraction * nExamplesInClass);
    const numTrain = nExamplesInClass - numValidation;

    loudLog('  nExamplesInClass', nExamplesInClass);
    loudLog('  numValidation', numValidation);
    loudLog('  numTrain', numTrain);

    const classTrain = examples[i].slice(0, numTrain).map((dataArray) => {
        return { data: dataArray, label: y };
    });
    loudLog('  classTrain', classTrain);
    const classValidation = examples[i].slice(numTrain).map((dataArray) => {
        return { data: dataArray, label: y };
    });
    loudLog('  classValidation', classValidation);

    trainDataset = trainDataset.concat(classTrain);
    validationDataset = validationDataset.concat(classValidation);
  }

  // finally shuffle both train and validation datasets
  trainDataset = fisherYates(trainDataset, seed);
  validationDataset = fisherYates(validationDataset, seed);

  const trainX = tf.data.array(trainDataset.map(sample => sample.data));
  const validationX = tf.data.array(validationDataset.map(sample => sample.data));
  const trainY = tf.data.array(trainDataset.map(sample => sample.label));
  const validationY = tf.data.array(validationDataset.map(sample => sample.label));

  // return tf.data dataset objects
  loudLog('  returning tf.data datasets');
  return {
    trainDataset: tf.data.zip({ xs: trainX,  ys: trainY}),
    validationDataset: tf.data.zip({ xs: validationX,  ys: validationY})
  };
}

// note: seed is a function!
/**
 * Shuffle an array of Float32Array or Samples using Fisher-Yates algorithm
 * Takes an optional seed value to make shuffling predictable
 */
function fisherYates(array, seed) {
  const length = array.length;

  // need to clone array or we'd be editing original as we goo
  const shuffled = array.slice();

  for (let i = (length - 1); i > 0; i -= 1) {
      let randomIndex ;
      if (seed) {
          randomIndex = Math.floor(seed() * (i + 1));
      }
      else {
          randomIndex = Math.floor(Math.random() * (i + 1));
      }

      [shuffled[i], shuffled[randomIndex]] = [shuffled[randomIndex],shuffled[i]];
  }

  return shuffled;
}

function flatOneHot(label, numClasses) {
  const labelOneHot = new Array(numClasses).fill(0);
  labelOneHot[label] = 1;
  return labelOneHot;
}



// takes output of convertToTfDataset, a map with train and test activations.
// this is the classifier; not the concept activation model
// it takes embeddings from the image model, and outputs binary classification of
// concept/not-concept.
async function trainConceptClassifier(conceptClassName, trainDataset, validationDataset, options = {}) {
  const embeddingOutputShape = [100]; // from TM image model
  const trainingParams = {
    epochs: 50,
    batchSize: 32,
    learningRate: 0.01,
    denseUnits: 100
  };

  // in case we need to use a seed for predictable training
  const seed = 3.14; // from TM
  const varianceScaling = (seed)
    ? tf.initializers.varianceScaling({seed})
    : tf.initializers.varianceScaling({});
  const conceptClassifier = tf.sequential({
    layers: [
      tf.layers.dense({
        inputShape: embeddingOutputShape,
        units: trainingParams.denseUnits,
        activation: 'relu',
        kernelInitializer: varianceScaling,
        useBias: true
      }),
      tf.layers.dense({
        kernelInitializer: varianceScaling,
        useBias: false,
        activation: 'softmax',
        units: 2 // concept / not-concept
      })
    ]
  });

  loudLog('  create conceptClassifier:', conceptClassifier);
  const optimizer = tf.train.adam(trainingParams.learningRate);
  conceptClassifier.compile({
    optimizer,
    loss: 'binaryCrossentropy', // i changed this from TM
    // loss: 'categoricalCrossentropy', 
    metrics: ['accuracy']
  });

  // visualize training
  const metrics = ['loss', 'val_loss']; // 'acc', 'val_acc'];
  const container = {
    name: 'Training',
    tab: conceptClassName,
    styles: {
      height: '600px'
    }
  };
  const {onEpochEnd} = tfvis.show.fitCallbacks(container, metrics);

  // actually train
  /// conceptUris, randomUris > train / validation
  loudLog('  starting to fit...');
  const trainingData = trainDataset.batch(trainingParams.batchSize);
  const validationData = validationDataset.batch(trainingParams.batchSize);
  const history = await conceptClassifier.fitDataset(trainingData, {
      epochs: trainingParams.epochs,
      validationData,
      callbacks: {
        onEpochEnd,
        ...options.callbacks
      }
  });

  return [conceptClassifier, history];
}


async function tcav(model, training, concepts, el, deps) {
  // "we derive CAVs by training a linear classifier between a concept’s examples and random counter examples"
  // for each concept...
  // grab random noise
  const noiseConceptClassName = 'random';
  const conceptClassNames = Object.keys(concepts.filesByClassName)
    .filter(className => className !== noiseConceptClassName);
    // .slice(0, 1); // hacking!

  loudLog('conceptClassNames', conceptClassNames);

  const noiseActivations = await getActivations(model, concepts.filesByClassName[noiseConceptClassName]);
  loudLog('noiseActivations', noiseActivations);

  // for loop over each concept, because async/await
  for (var i = 0; i < conceptClassNames.length; i++) {
    // get activations
    let conceptClassName = conceptClassNames[i];
    loudLog('  training this concept:', conceptClassName);
    let imageBlobUrls = concepts.filesByClassName[conceptClassName] || [];
    let conceptActivations = await getActivations(model, imageBlobUrls);

    loudLog('  conceptActivations', conceptClassName, conceptActivations);

    // 1. prep dataset for concept
    // in python... https://github.com/tensorflow/tcav/blob/master/tcav/cav.py#L123
    //  # to make sure postiive and negative examples are balanced,
    //  # truncate all examples to the size of the smallest concept.
    let ds = convertToTfDataset([noiseActivations, conceptActivations]); // 0=noise, 1=concept
    loudLog('  datasets', ds);

    // 2. train concept model (model embeddings > concept classification)
    // in python they just do a linear/logistic regression https://github.com/tensorflow/tcav/blob/master/tcav/cav.py#L169
    // then the CAVs are the coefficients
    // different than https://github.com/tensorflow/tcav/blob/master/tcav/cav.py#L234
    loudLog('  fitting...');
    tfvis.visor()
    // visorButtonEl.style.display = 'inline-block';
    let [conceptClassifier, history] = await trainConceptClassifier(conceptClassName, ds.trainDataset, ds.validationDataset, {
      callbacks: {
        onYield(epoch, batch, logs) {
          loudLog('  onYield(batch, epoch, loss)', batch, epoch, logs.loss);
        }
      }
    });
    loudLog('  done training model', conceptClassifier);
    loudLog('  history:', history);

    // get activations and concept labels for training data
    const [conceptLabelsByTrainingClass, activationsByTrainingClass] = await async function() {
      // 3a. get activations from model's final activation layer
      const {conceptLabelsByTrainingClass, activationsByTrainingClass} = await getActivationsAndConceptLabels(model, conceptClassifier, conceptClassName, training);
      loudLog('conceptLabelsByTrainingClass', conceptLabelsByTrainingClass);
      loudLog('activationsByTrainingClass', activationsByTrainingClass);
      return [conceptLabelsByTrainingClass, activationsByTrainingClass];
      
      // 3b. get activations from concept classifier' final activation layer
      // const {conceptLabelsByTrainingClass, activationsByTrainingClass} = await getActivationsAndConceptLabels(model, conceptClassifier, conceptClassName, training);
      // const conceptActivationModel = await getConceptActivationModel(model, conceptClassifier);
      // loudLog('  conceptActivationModel', conceptActivationModel);
      // const conceptClassifierActivationsByTrainingClass = await getConceptClassifierActivations(conceptActivationModel, training);
      // loudLog('  conceptClassifierActivationsByTrainingClass', conceptClassifierActivationsByTrainingClass);
      // return [conceptLabelsByTrainingClass, conceptClassifierActivationsByTrainingClass];
    }();


    // 4b. plot these on umap?
    // project
    Object.keys(activationsByTrainingClass).map(async trainingClass => {
      loudLog('umap', trainingClass);
      const prng = new Prando(RANDOM_SEED);
      const random = () => prng.next();
      const umap = new UMAP({
        random, // fix seed for determinism
        nComponents: 2
      });

      loudLog('  fitting...');
      const activations = activationsByTrainingClass[trainingClass];
      const xys = await umap.fitAsync(activations);
      
      loudLog('  projecting...');
      const umapEl = document.createElement('div');
      umapEl.classList.add('Projector');
      umapEl.style.display = 'inline-block';
      umapEl.style['vertical-align'] = 'top';
      el.appendChild(umapEl);
      
      // order of merging matters here
      const metadata = xys.map((xy, i) => {
        const predictions = conceptLabelsByTrainingClass[trainingClass][i];
        const uri = training.filesByClassName[trainingClass][i];
        return {predictions, uri};
      });
      await projectScatterplot(umapEl, xys, metadata, {
        sprites: false,
        color: false,
        simpleColor: true,
        title: `"${conceptClassName}" concept for training class: ${trainingClass}`
      });
      console.log('projected', umapEl);
      // conceptActivationsByTrainingClass
      // const examples = await mapExamples(training, async (className, blobUrl, index) => {
      //   await imageFromUri(blobUrl);
      //   return {className, index, predictions, blobUrl};
      // });
      // useProjector(umapEl, conceptActivationsByTrainingClass.cat, examples, {...projectorOptions, title: 'Embeddings from MobileNet'});
    });

    // 5. "and then taking the vector orthogonal to the decision boundary"
    // TODO

    // 6. show CAVs per-class
    // TODO

  } // end concept

  loudLog('done');
}

async function getActivationsAndConceptLabels(tmImageModel, conceptClassifier, conceptClassName, training) {
  loudLog('getActivationsAndConceptLabels', tmImageModel, conceptClassifier, conceptClassName, training);
  let conceptLabelsByTrainingClass = {};
  let activationsByTrainingClass = {};
  const trainingClassNames = Object.keys(training.filesByClassName)
  for (var i = 0; i < trainingClassNames.length; i++) {
    let trainingClassName = trainingClassNames[i];
    loudLog('  for training concept:', trainingClassName);
    let imageBlobUrls = training.filesByClassName[trainingClassName] || [];
    for (var j = 0; j < imageBlobUrls.length; j++) {
      // same capture/normalization as TM
      let modelActivation = await getActivation(tmImageModel, imageBlobUrls[j]);
      activationsByTrainingClass[trainingClassName] || (activationsByTrainingClass[trainingClassName] = []);
      activationsByTrainingClass[trainingClassName].push(modelActivation);

      let modelTensor = tf.tensor([modelActivation]); // just reshaping for #predict API
      let conceptPredictions = (await conceptClassifier.predict(modelTensor)).dataSync();
      
      // reshape predictions (0=noise, 1=concept)
      let reshapedPredictions = [
        { className: 'noise', probability: conceptPredictions[0] },
        { className: conceptClassName, probability: conceptPredictions[1] },
      ];
      conceptLabelsByTrainingClass[trainingClassName] || (conceptLabelsByTrainingClass[trainingClassName] = []);
      conceptLabelsByTrainingClass[trainingClassName].push(reshapedPredictions);
    }
  }
  return {conceptLabelsByTrainingClass, activationsByTrainingClass};
}

// return concrete data
async function getActivations(tmImageModel, uris) {
  let activations = [];
  for (var i = 0; i < uris.length; i++) {
    let activation = await getActivation(tmImageModel, uris[i]);
    activations.push(activation);
  }
  return activations;
}

async function getActivation(tmImageModel, uri) {
  const imgEl = await imageFromUri(uri);
  const tensor = await infer(tmImageModel, imgEl);
  return tensor.dataSync();
}

/*

model = app.readState().model;
training = app.readState().training;
concepts = app.readState().concepts;
el = document.querySelector('.Workspace');
deps = {}


out = (await tcav(model, training, concepts, el, deps));


conceptModels[0].predict(capture(imageFromUri(app.readState().training.filesByClassName.cat[0])))
*/



// debuggging
window.imageFromUri = imageFromUri;
window.infer = infer;
window.capture = capture;
window.cropTensor = cropTensor;



/* ---- */
// This takes a concept classifier and an image model, then then gives a concept
// activation model.
async function getConceptActivationModel(tmImageModel, conceptClassifier) {
  // img tensor > model activations
  const tfModel = tmImageModel.model;
  const toModelEmbeddings = tf.sequential();
  toModelEmbeddings.add(_.first(tfModel.layers)); // mobilenet
  toModelEmbeddings.add(_.first(_.last(tfModel.layers).layers)); // dense layer, without softmax

  // model activations > concept activations
  const toConceptActivations = tf.sequential();
  toConceptActivations.add(_.first(conceptClassifier.layers)); // dense layer, without softmax

  // stack together
  const conceptActivationModel = tf.sequential();
  conceptActivationModel.add(toModelEmbeddings);
  conceptActivationModel.add(toConceptActivations);

  return conceptActivationModel;
}


// ie, embeddings from concept classifier
async function getConceptClassifierActivations(conceptActivationModel, training) {
  loudLog('getConceptClassifierActivations');
  let byTrainingClass = {};
  const trainingClassNames = Object.keys(training.filesByClassName)
  for (var i = 0; i < trainingClassNames.length; i++) {
    let trainingClassName = trainingClassNames[i];
    loudLog('  for training concept:', trainingClassName);
    let imageBlobUrls = training.filesByClassName[trainingClassName] || [];
    for (var j = 0; j < imageBlobUrls.length; j++) {
      // same capture/normalization as TM
      let raster = await imageFromUri(imageBlobUrls[j]);
      let tensor = capture(raster);
      let conceptActivation = (await conceptActivationModel.predict(tensor)).dataSync();

      byTrainingClass[trainingClassName] || (byTrainingClass[trainingClassName] = []);
      byTrainingClass[trainingClassName].push(conceptActivation);
     }
   }
  return byTrainingClass;
 };
