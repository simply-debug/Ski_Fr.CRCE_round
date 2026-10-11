
let glassCursor = null;

// Create the cursor
export function initializeCursor() {
    glassCursor = document.createElement("div");
    glassCursor.className = "glass-cursor";

    document.body.appendChild(glassCursor);

    document.documentElement.classList.add("glass-cursor-on");

    console.log("Liquid Glass cursor initialized!");
}

// Move the cursor using head coordinates
export function moveCursor({ x, y }) {
    if (!glassCursor) {
        initializeCursor();
    }

    // Convert normalized coordinates to screen coordinates
    const cursorX = (1 - x) * window.innerWidth;
    const cursorY = y * window.innerHeight;

    glassCursor.style.left = `${cursorX}px`;
    glassCursor.style.top = `${cursorY}px`;

    glassCursor.classList.add("visible");
}

// Hide the cursor
export function hideCursor() {
    if (glassCursor) {
        glassCursor.classList.remove("visible");
    }
}