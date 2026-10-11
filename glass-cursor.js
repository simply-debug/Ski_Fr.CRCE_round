document.addEventListener("DOMContentLoaded", () => {
  const cursor = document.createElement("div");
  cursor.className = "glass-cursor";
  document.body.appendChild(cursor);
  document.documentElement.classList.add("glass-cursor-on");
  document.addEventListener("mousemove", (event) => {
    cursor.style.left = `${event.clientX}px`;
    cursor.style.top = `${event.clientY}px`;
    cursor.classList.add("visible");
  });
  document.addEventListener("mouseleave", () => {
    cursor.classList.remove("visible");
  });
  document.addEventListener("mousedown", () => {
    cursor.classList.add("down");
  });
  document.addEventListener("mouseup", () => {
    cursor.classList.remove("down");
  });
  document.addEventListener("mouseover", (event) => {
    if (!(event.target instanceof Element)) return;
    const interactive = event.target.closest(
      "button, a, input, select, summary, label"
    );
    cursor.classList.toggle("hover", Boolean(interactive));
  });
});