import {
    FaceLandmarker,
    FilesetResolver
} from "./lib/vision_bundle.mjs";

let faceLandmarker = null;
let webcam = null;
let animationFrameId = null;

let isTracking = false;

// Previous coordinates for smoother movement
let previousX = 0.5;
let previousY = 0.5;

// Controls how smooth the cursor movement will be
const SMOOTHING_FACTOR = 0.25;

let lastVideoTime = -1;

// Initialize MediaPipe Face Landmarker
async function initializeFaceLandmarker() {
    const vision = await FilesetResolver.forVisionTasks(
        chrome.runtime.getURL("lib/wasm")
    );

    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: chrome.runtime.getURL(
                "models/face_landmarker.task"
            )
        },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: true
    });

    console.log("Face Landmarker initialized.");
}

// Start webcam and head tracking
export async function startHeadTracking(onHeadMove) {
    try {
        if (isTracking) {
            console.log("Head tracking is already running.");
            return;
        }

        // Initialize the face detection model
        if (!faceLandmarker) {
            await initializeFaceLandmarker();
        }

        // Request webcam access with optimized lower resolution[cite: 10]
        webcam = document.createElement("video");

        webcam.autoplay = true;
        webcam.playsInline = true;
        webcam.muted = true;

        webcam.srcObject = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "user",
                width: 320,  // Reduced from 640 to lighten GPU load[cite: 10]
                height: 240  // Reduced from 480[cite: 10]
            },
            audio: false
        });

        await webcam.play();

        isTracking = true;

        console.log("Webcam started. Head tracking is active.");

        // Process webcam frames with frame-skipping / time-checking to prevent overload[cite: 10]
        function processFrame() {
            if (!isTracking) {
                return;
            }

            if (webcam.readyState >= 2 && webcam.currentTime !== lastVideoTime) {
                lastVideoTime = webcam.currentTime;

                const results = faceLandmarker.detectForVideo(
                    webcam,
                    performance.now()
                );

                if (results.faceLandmarks &&
                    results.faceLandmarks.length > 0) {

                    const landmarks = results.faceLandmarks[0];

                    // Nose landmark as a reference point[cite: 10]
                    const nose = landmarks[1];

                    // Normalized webcam coordinates[cite: 10]
                    const rawX = nose.x;
                    const rawY = nose.y;

                    // Smooth sudden changes[cite: 10]
                    const smoothX =
                        previousX +
                        SMOOTHING_FACTOR * (rawX - previousX);

                    const smoothY =
                        previousY +
                        SMOOTHING_FACTOR * (rawY - previousY);

                    previousX = smoothX;
                    previousY = smoothY;

                    // Send coordinates to the cursor controller[cite: 10]
                    onHeadMove({
                        x: smoothX,
                        y: smoothY
                    });
                }
            }

            animationFrameId = requestAnimationFrame(processFrame);
        }

        processFrame();

    } catch (error) {
        console.error("Head tracking error:", error);
        stopHeadTracking();
        throw error;
    }
}

// Stop webcam and head tracking
export function stopHeadTracking() {
    isTracking = false;

    if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    if (webcam && webcam.srcObject) {
        webcam.srcObject.getTracks().forEach(track => track.stop());
        webcam.srcObject = null;
    }

    webcam = null;

    // Explicitly release MediaPipe WASM heap memory to prevent memory leaks
    if (faceLandmarker && typeof faceLandmarker.close === 'function') {
        try {
            faceLandmarker.close();
        } catch (_) {}
        faceLandmarker = null;
    }

    console.log("Head tracking stopped.");
}