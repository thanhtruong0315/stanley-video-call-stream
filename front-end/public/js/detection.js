let videoWidth, videoHeight;

let qvga = { width: { exact: 320 }, height: { exact: 240 } };

let vga = { width: { exact: 640 }, height: { exact: 480 } };

let resolution = window.innerWidth < 640 ? qvga : vga;

// whether streaming video from the camera.
let streaming = false;


var previewContainer = document.getElementById('remote-media');
let video = null;

// attachTracks([track], previewContainer);
// filterLocalVideo(previewContainer.querySelector('video'), filtered, 'grayscale');

let canvasOutput = document.getElementById('canvasOutput');
let canvasOutputCtx = canvasOutput.getContext('2d');
let stream = null;

let detectFace = document.getElementById('face');
let detectEye = document.getElementById('eye');

let info = document.getElementById('info');
let clickedX = 70;
let clickedY = 70;
let isTracking = false;
canvasOutput.addEventListener('click', function (event) {
  var x;
  var y;
  if (event.pageX || event.pageY) {
    x = event.pageX;
    y = event.pageY;
  }
  else {
    x = event.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
    y = event.clientY + document.body.scrollTop + document.documentElement.scrollTop;
  }
  x -= canvasOutput.offsetLeft;
  y -= canvasOutput.offsetTop;

  clickedX = x;
  clickedY = y;
  isNewTracking = true;
  console.log('x=', x);
  console.log('y=', y);
  isTracking = true;
  // startTracking();
}, false);

function startCamera() {
  video = previewContainer.querySelector('video');
  if (streaming) return;
  navigator.mediaDevices.getUserMedia({ video: resolution, audio: false })
    .then(function (s) {
      stream = s;
      video.srcObject = s;
      video.play();
    })
    .catch(function (err) {
      console.log("An error occured! " + err);
    });

  video.addEventListener("canplay", function (ev) {
    if (!streaming) {
      videoWidth = video.videoWidth;
      videoHeight = video.videoHeight;
      video.setAttribute("width", videoWidth);
      video.setAttribute("height", videoHeight);
      canvasOutput.width = videoWidth;
      canvasOutput.height = videoHeight;
      streaming = true;
    }
    startVideoProcessing();
  }, false);
}

function buildTrackingWindow(clickedX, clickedY) {
  const edge = 160;
  let x = (clickedX - (edge / 2)) > 0 ? (clickedX - (edge / 2)) : 0;
  let y = (clickedY - (edge / 2)) > 0 ? (clickedY - (edge / 2)) : 0;
  return new cv.Rect(x, y, edge, edge);
}
function startTracking() {
  let cap = new cv.VideoCapture(video);

  // take first frame of the video
  let frame = new cv.Mat(video.height, video.width, cv.CV_8UC4);
  cap.read(frame);

  // hardcode the initial location of window
  let trackWindow = buildTrackingWindow(clickedX, clickedY);

  // set up the ROI for tracking
  let roi = frame.roi(trackWindow);
  let hsvRoi = new cv.Mat();
  cv.cvtColor(roi, hsvRoi, cv.COLOR_RGBA2RGB);
  cv.cvtColor(hsvRoi, hsvRoi, cv.COLOR_RGB2HSV);
  let mask = new cv.Mat();
  let lowScalar = new cv.Scalar(30, 30, 0);
  let highScalar = new cv.Scalar(180, 180, 180);
  let low = new cv.Mat(hsvRoi.rows, hsvRoi.cols, hsvRoi.type(), lowScalar);
  let high = new cv.Mat(hsvRoi.rows, hsvRoi.cols, hsvRoi.type(), highScalar);
  cv.inRange(hsvRoi, low, high, mask);
  let roiHist = new cv.Mat();
  let hsvRoiVec = new cv.MatVector();
  hsvRoiVec.push_back(hsvRoi);
  cv.calcHist(hsvRoiVec, [0], mask, roiHist, [180], [0, 180]);
  cv.normalize(roiHist, roiHist, 0, 255, cv.NORM_MINMAX);

  // delete useless mats.
  roi.delete(); hsvRoi.delete(); mask.delete(); low.delete(); high.delete(); hsvRoiVec.delete();

  // Setup the termination criteria, either 10 iteration or move by atleast 1 pt
  let termCrit = new cv.TermCriteria(cv.TERM_CRITERIA_EPS | cv.TERM_CRITERIA_COUNT, 5, 1);

  let hsv = new cv.Mat(video.height, video.width, cv.CV_8UC3);
  let hsvVec = new cv.MatVector();
  hsvVec.push_back(hsv);
  let dst = new cv.Mat();
  let trackBox = null;

  const FPS = 30;
  function processVideo() {
    try {
      if (!streaming) {
        // clean and stop.
        frame.delete(); dst.delete(); hsvVec.delete(); roiHist.delete(); hsv.delete();
        return;
      }
      let begin = Date.now();

      // start processing.
      cap.read(frame);
      cv.cvtColor(frame, hsv, cv.COLOR_RGBA2RGB);
      cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
      cv.calcBackProject(hsvVec, [0], roiHist, dst, [0, 180], 1);
      if (isTracking) {
        // apply camshift to get the new location
        [trackBox, trackWindow] = cv.CamShift(dst, trackWindow, termCrit);

        // Draw it on image
        let pts = cv.rotatedRectPoints(trackBox);
        cv.line(frame, pts[0], pts[1], [255, 0, 0, 255], 3);
        cv.line(frame, pts[1], pts[2], [255, 0, 0, 255], 3);
        cv.line(frame, pts[2], pts[3], [255, 0, 0, 255], 3);
        cv.line(frame, pts[3], pts[0], [255, 0, 0, 255], 3);
      }
      cv.circle(frame, { x: clickedX, y: clickedY }, 40, [255, 0, 0, 255], 3);
      cv.imshow('canvasOutput', frame);

      // schedule the next one.
      let delay = 1000 / FPS - (Date.now() - begin);
      setTimeout(processVideo, delay);
    } catch (err) {
      utils.printError(err);
    }
  };

  // schedule the first one.
  setTimeout(processVideo, 0);

}


let faceClassifier = null;
let eyeClassifier = null;

let src = null;
let dstC1 = null;
let dstC3 = null;
let dstC4 = null;

let canvasInput = null;
let canvasInputCtx = null;

let canvasBuffer = null;
let canvasBufferCtx = null;

function startVideoProcessing() {
  if (!streaming) { console.warn("Please startup your webcam"); return; }
  stopVideoProcessing();
  canvasInput = document.createElement('canvas');
  canvasInput.width = videoWidth;
  canvasInput.height = videoHeight;
  canvasInputCtx = canvasInput.getContext('2d');

  canvasBuffer = document.createElement('canvas');
  canvasBuffer.width = videoWidth;
  canvasBuffer.height = videoHeight;
  canvasBufferCtx = canvasBuffer.getContext('2d');

  srcMat = new cv.Mat(videoHeight, videoWidth, cv.CV_8UC4);
  grayMat = new cv.Mat(videoHeight, videoWidth, cv.CV_8UC1);

  faceClassifier = new cv.CascadeClassifier();
  faceClassifier.load('haarcascade_frontalface_default.xml');

  eyeClassifier = new cv.CascadeClassifier();
  eyeClassifier.load('haarcascade_eye.xml');

  requestAnimationFrame(processVideo);
}

function processVideo() {
  stats.begin();
  canvasInputCtx.drawImage(video, 0, 0, videoWidth, videoHeight);
  let imageData = canvasInputCtx.getImageData(0, 0, videoWidth, videoHeight);
  srcMat.data.set(imageData.data);
  cv.cvtColor(srcMat, grayMat, cv.COLOR_RGBA2GRAY);
  let faces = [];
  let eyes = [];
  let size;
  if (detectFace.checked) {
    let faceVect = new cv.RectVector();
    let faceMat = new cv.Mat();
    if (detectEye.checked) {
      cv.pyrDown(grayMat, faceMat);
      size = faceMat.size();
    } else {
      cv.pyrDown(grayMat, faceMat);
      if (videoWidth > 320)
        cv.pyrDown(faceMat, faceMat);
      size = faceMat.size();
    }
    faceClassifier.detectMultiScale(faceMat, faceVect);
    for (let i = 0; i < faceVect.size(); i++) {
      let face = faceVect.get(i);
      faces.push(new cv.Rect(face.x, face.y, face.width, face.height));
      if (detectEye.checked) {
        let eyeVect = new cv.RectVector();
        let eyeMat = faceMat.roi(face);
        eyeClassifier.detectMultiScale(eyeMat, eyeVect);
        for (let i = 0; i < eyeVect.size(); i++) {
          let eye = eyeVect.get(i);
          eyes.push(new cv.Rect(face.x + eye.x, face.y + eye.y, eye.width, eye.height));
        }
        eyeMat.delete();
        eyeVect.delete();
      }
    }
    faceMat.delete();
    faceVect.delete();
  } else {
    if (detectEye.checked) {
      let eyeVect = new cv.RectVector();
      let eyeMat = new cv.Mat();
      cv.pyrDown(grayMat, eyeMat);
      size = eyeMat.size();
      eyeClassifier.detectMultiScale(eyeMat, eyeVect);
      for (let i = 0; i < eyeVect.size(); i++) {
        let eye = eyeVect.get(i);
        eyes.push(new cv.Rect(eye.x, eye.y, eye.width, eye.height));
      }
      eyeMat.delete();
      eyeVect.delete();
    }
  }
  canvasOutputCtx.drawImage(canvasInput, 0, 0, videoWidth, videoHeight);
  drawResults(canvasOutputCtx, faces, 'red', size);
  drawResults(canvasOutputCtx, eyes, 'yellow', size);
  stats.end();
  requestAnimationFrame(processVideo);
}

function drawResults(ctx, results, color, size) {
  for (let i = 0; i < results.length; ++i) {
    let rect = results[i];
    let xRatio = videoWidth / size.width;
    let yRatio = videoHeight / size.height;
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.strokeRect(rect.x * xRatio, rect.y * yRatio, rect.width * xRatio, rect.height * yRatio);
  }
}

function stopVideoProcessing() {
  if (src != null && !src.isDeleted()) src.delete();
  if (dstC1 != null && !dstC1.isDeleted()) dstC1.delete();
  if (dstC3 != null && !dstC3.isDeleted()) dstC3.delete();
  if (dstC4 != null && !dstC4.isDeleted()) dstC4.delete();
}

function stopCamera() {
  if (!streaming) return;
  stopVideoProcessing();
  document.getElementById("canvasOutput").getContext("2d").clearRect(0, 0, width, height);
  video.pause();
  video.srcObject = null;
  stream.getVideoTracks()[0].stop();
  streaming = false;
}

function initUI() {
  stats = new Stats();
  stats.showPanel(0);
  document.getElementById('container').appendChild(stats.dom);
}

function opencvIsReady() {
  console.log('OpenCV.js is ready');
  if (!featuresReady) {
    console.log('Requred features are not ready.');
    return;
  }
  info.innerHTML = '';
  initUI();
  // startCamera();
}
