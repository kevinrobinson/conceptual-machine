// flatten data, round numbers for UX
function reshapeData(items) {
  return items.map(function(item, i) {
    const classification = _.maxBy(item.predictions, 'probability').className;
    const labels = item.predictions.reduce((map, p) => {
      return {
        ...map,
        [textLabelForClassName(p.className)]: parseFloat(p.probability.toFixed(4))
      };
    }, {});
    return {
      i,
      classification,
      predictions: item.predictions,
      hashedURI: hash64(item.blobUrl),
      uri: item.blobUrl,
      source: item.source,
      filename: item.filename,
      filenameLabel: item.filenameLabel,
      searchQuery: item.query,
      elapsedSeconds: item.elapsedSeconds,
      ...labels,
      raw: item
    };
  });
}

// facets
export async function facets(targetEl, items) {
  const facetsData = reshapeData(items);
  const classNames = _.uniq(_.flatMap(facetsData, d => d.predictions.map(p => p.className)));

  // create or grab the polymer el
  var facetsDiveEl = targetEl.querySelector('facets-dive');
  var didCreate = false;
  if (!facetsDiveEl) {
    const el = document.createElement('div');
    el.innerHTML = '<facets-dive width="800" height="600" />';
    targetEl.appendChild(el);
    facetsDiveEl = targetEl.querySelector('facets-dive');
    didCreate = true;
  }

  // the order of these calls matters
  // only set defaults; otherwise let user interactions stick through renders
  const excludeFromPanel = ['i', 'hashedURI', 'uri', 'predictions'];
  facetsDiveEl.data = facetsData;
  facetsDiveEl.infoRenderer = facetsInfoRenderer.bind(null, facetsData, excludeFromPanel);
  if (didCreate) {
    facetsDiveEl.hideInfoCard = false;
    facetsDiveEl.verticalFacet = textLabelForClassName(classNames[0]);
    facetsDiveEl.verticalBuckets = 4;
    facetsDiveEl.horizontalFacet = 'className';
    // facetsDiveEl.tweenDuration = 0;
    // facetsDiveEl.fadeDuration = 0;
  }
  
  // sprite sheet
  // see https://github.com/PAIR-code/facets/tree/master/facets_dive#providing-sprites-for-dive-to-render
  // 64x64 is the assumption
  const {canvas, uri} = await createFacetsAtlas(facetsData.map(d => d.uri), 64, 64);
  // console.log('uri', uri);
  // document.body.appendChild(canvas);
  facetsDiveEl.atlasUrl = uri;
  facetsDiveEl.spriteImageWidth = 64;
  facetsDiveEl.spriteImageHeight = 64;
}

function textLabelForClassName(className) {
  return `${className} score`;
};


async function createFacetsAtlas(uris, width, height) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  const cols = Math.ceil(Math.sqrt(uris.length));
  canvas.width = cols * width;
  canvas.height = cols * width;
  await Promise.all(uris.map((uri, index) => {
    const x = width * (index % cols);
    const y = height * Math.floor(index / cols);
    const img = new Image();
    return new Promise(function(resolve, reject) {
      img.onload = function() {
        context.drawImage(img, x, y, width, height);
        resolve();
      };
      img.crossOrigin = 'Anonymous'; // allow images from search
      img.src = uri;
    });
  }));
  
  const uri = canvas.toDataURL();
  return {canvas, uri};
}

// see https://github.com/PAIR-code/facets/blob/967e764dd8fbc8327ba9d4e39f3c0d76dce834b9/facets_dive/lib/info-renderers.ts#L26
function facetsInfoRenderer(facetsData, excludeFromPanel, selectedObject, elem) {
  // copied
  const dl = document.createElement('dl');
  
  // inserted
  const d = _.find(facetsData, d => hash64(d.uri) === selectedObject.hashedURI);
  if (d) {
    const img = document.createElement('img');
    img.crossOrigin = 'Anonymous';
    img.src = d.uri;
    img.style.width = '100%';
    dl.appendChild(img);
  }
  
  // copied
  for (const field in selectedObject) {
    // modified
    if (excludeFromPanel.indexOf(field) !== -1) {
      continue;
    }
    if (!selectedObject.hasOwnProperty(field)) {
      continue;
    }
    // modified
    if (selectedObject[field] === undefined) {
      continue;
    }
    
    const dt = document.createElement('dt');
    dt.textContent = field;
    dl.appendChild(dt);
    const dd = document.createElement('dd');
    dd.textContent = selectedObject[field];
    dl.appendChild(dd);
  }
  
  elem.appendChild(dl);
};


function hash64(str) {
  return window.CryptoJS.MD5(str).toString(window.CryptoJS.enc.Base64);
}