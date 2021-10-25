// neural network constants
const memoryDepth = 10;
const confidenceThreshold = 0.05;
const epochs = 30;

// neural network variables
let userMemory = [];
let computerMemory = [];
let model, prediction, training, possibleInputs;

async function chooseButton(button) {
	if (!prediction) {
		return;
	}

	const predictionIndex = getPredictionIndex(prediction);
	const buttonIndex = getButtonIndex(button);
	const correctPrediction = predictionIndex === buttonIndex;

	// indicate that training has begun
	training = true;
	$("#pyotr").addClass("shake");

	displayComputerCard(predictionIndex);
	updatePreviousRoundDisplay(buttonIndex, predictionIndex);
	updateFacialExpression(correctPrediction);

	if (possibleInputs === 3) {
		if (correctPrediction) {
			updateScore(-1);
		} else {
			updateScore((buttonIndex + 1) % 3 === predictionIndex ? 1 : 0);
		}
	} else {
		updateScore(correctPrediction ? -1 : 1);
	}
	updateGraphs(prediction[predictionIndex], correctPrediction);

	tf.engine().startScope();

	let inputTensor = constructMemoryTensor();
	await trainModel(inputTensor, button);

	// add to user memory
	userMemory.unshift(button);
	if (userMemory.length > memoryDepth) {
		userMemory.splice(memoryDepth);
	}

	// add to computer memory
	computerMemory.unshift(getComputerOneHot(predictionIndex));
	if (computerMemory.length > memoryDepth) {
		computerMemory.splice(memoryDepth);
	}

	inputTensor = constructMemoryTensor();
	predictionTensor = await model.predict(inputTensor);
	predictionTensor.print();
	prediction = predictionTensor.dataSync();

	training = false;
	$("#pyotr").removeClass("shake");
	if (!animating && disabled) {
		enableButtons();
	}

	tf.engine().endScope();
}

function constructMemoryTensor() {
	const combinedArray = [];
	for (let i = 0; i < memoryDepth; i++) {
		for (let j = 0; j < possibleInputs; j++) {
			combinedArray.push(userMemory[i][j]);
			combinedArray.push(computerMemory[i][j]);
		}
	}

	return tf.tensor3d(combinedArray, [1, memoryDepth, possibleInputs * 2]).reverse([1, 0]);
}

function getPredictionIndex(prediction) {
	let maxIndex = 0;
	for (let i = 1; i < prediction.length; i++) {
		if (prediction[i] > prediction[maxIndex]) {
			maxIndex = i;
		}
	}

	const sortedPrediction = prediction.slice().sort().reverse();
	// this absolute value isn't really necessary but let's be safe
	const maxDiff = Math.abs(sortedPrediction[0] - sortedPrediction[1]);
	if (maxDiff < confidenceThreshold) {
		return Math.floor(Math.random() * prediction.length);
	}
	return maxIndex;
}

function getButtonIndex(button) {
	for (let i = 0; i < button.length; i++) {
		if (button[i] === 1) {
			return i;
		}
	}
	return -1;
}

function getComputerOneHot(index) {
	const result = [];
	for (let i = 0; i < possibleInputs; i++) {
		result.push(i === index ? 1 : 0);
	}
	return result;
}

async function trainModel(inputTensor, button) {
	const correctResult = tf.tensor2d(button, [1, possibleInputs]);

	await model.fit(inputTensor, correctResult, {
		batchSize: 1,
		epochs,
		shuffle: false,
	});
}

async function setupModel() {
	disableButtons();
	training = false;
	tf.engine().startScope();

	// Create a sequential model
	model = tf.sequential({
		layers: [
			tf.layers.lstm({ inputShape: [memoryDepth, possibleInputs * 2], units: 2 * memoryDepth * possibleInputs, returnSequences: false }),
			tf.layers.dense({ units: 20 * possibleInputs, activation: "relu" }),
			tf.layers.dense({ units: 20 * possibleInputs, activation: "relu" }),
			tf.layers.dense({ units: 10 * possibleInputs, activation: "relu" }),
			tf.layers.dense({ units: possibleInputs, activation: "softmax" }),
		],
	});

	await model.compile({
		optimizer: tf.train.adam(),
		loss: tf.losses.meanSquaredError,
	});

	zeroMemory();
	const inputTensor = constructMemoryTensor();
	prediction = await model.predict(inputTensor).dataSync();

	tf.engine().endScope();
	enableButtons();
	setupButtonActions();
}

function zeroMemory() {
	userMemory = [];
	computerMemory = [];

	zeroRound = [];
	for (let i = 0; i < possibleInputs; i++) {
		zeroRound.push(0);
	}
	// fill the memory arrays with 0s
	while (userMemory.length < memoryDepth) {
		userMemory.push(zeroRound);
	}
	while (computerMemory.length < memoryDepth) {
		computerMemory.push(zeroRound);
	}
}

function setupGame(mode) {
	possibleInputs = mode;
	displayPlayerCards();
	setupScore();
	scoreGraph = new ScoreTimeGraph();
	confidenceGraph = new ConfidenceTimeGraph();
	accuracyGraph = new AccuracyTimeGraph();
	if (model) {
		tf.dispose(model);
		tf.disposeVariables();
	}
	setupModel();
}

$("document").ready(() => {
	setupGame(3);
});
