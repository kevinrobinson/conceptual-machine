// from https://glitch.com/edit/#!/tm-image-demo?path=js/bar-graph.js:81:0
// these are the colors of our bars
let colors = ['#E67701', '#D84C6F', '#794AEF', '#1291D0'];
let lightColors = ['#FFECE2', '#FFE9EC', '#F1F0FF', '#E2F5FF'];

// make a bar in the graph for each label in the metadata
// returns update fn
export async function create(graphWrapper, labels, predictions) {
    let bars = {};
    labels.forEach((label, index) => makeBar(graphWrapper, bars, label, index));
    updateBarGraph(bars, predictions);

    return updateBarGraph.bind(null, bars);
}

// This function makes a bar in the graph
function makeBar(graphWrapper, bars, label, index) {
    // make the elements of the bar
    let barWrapper = document.createElement('div');
    let barEl = document.createElement('progress');
    let percentEl = document.createElement('span');
    let labelEl = document.createElement('span');
    labelEl.innerText = label;

    // assemble the elements
    barWrapper.appendChild(labelEl);
    barWrapper.appendChild(percentEl);
    barWrapper.appendChild(barEl);
    graphWrapper.appendChild(barWrapper);

    // style the elements
    // let color = colors[index % colors.length];
    // let lightColor = lightColors[index % colors.length];
    // barWrapper.style.color = color;
    // barWrapper.style.setProperty('--color', color);
    // barWrapper.style.setProperty('--color-light', lightColor);

    // save references to each element, so we can update them later
    bars[label] = {
        bar: barEl,
        percent: percentEl
    };
}

// This function takes data (retrieved in the model.js file)
// The data is in the form of an array of objects like this:
// [{ className:class1, probability:0.75 }, { className:class2, probability:0.25 }, ... ]
// it uses this data to update the progress and labels of of each bar in the graph
function updateBarGraph(bars, data) {
    // iterate through each element in the data
    data.forEach(({ className, probability }) => {
        // get the HTML elements that we stored in the makeBar function
        let barElements = bars[className];
        let barElement = barElements.bar;
        let percentElement = barElements.percent;
        // set the progress on the bar
        barElement.value = probability;
        // set the percent value on the label
        percentElement.innerText = convertToPercent(probability);
    });
}

// This function converts a decimal number (between 0 and 1)
// to an integer percent (between 0% and 100%)
function convertToPercent(num) {
    num *= 100;
    num = Math.round(num);
    return `${num}%`;
}
