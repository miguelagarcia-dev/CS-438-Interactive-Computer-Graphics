"use strict";

// Generic status helper for WebGPU preview messages.
function wgpuSetStatus(statusElem, message, kind) {
    if (!statusElem) return;
    statusElem.textContent = message;

    const palette = {
        ok: { color: "#0f5132", bg: "#d1e7dd", border: "#198754" },
        warn: { color: "#664d03", bg: "#fff3cd", border: "#ffca2c" },
        error: { color: "#842029", bg: "#f8d7da", border: "#dc3545" },
        info: { color: "#055160", bg: "#cff4fc", border: "#0dcaf0" }
    };

    const style = palette[kind] || palette.info;
    statusElem.style.color = style.color;
    statusElem.style.backgroundColor = style.bg;
    statusElem.style.borderLeft = "4px solid " + style.border;
    statusElem.style.padding = "8px 10px";
    statusElem.style.margin = "6px 0";
}

// Acquire adapter/device/context and configure the WebGPU canvas.
async function wgpuInitCanvasContext(canvas, statusElem, label) {
    const prefix = label || "WebGPU";

    if (!canvas) {
        wgpuSetStatus(statusElem, prefix + " init failed: canvas element is missing.", "error");
        return null;
    }

    if (!("gpu" in navigator)) {
        wgpuSetStatus(statusElem, prefix + " unavailable: this browser does not expose navigator.gpu.", "warn");
        return null;
    }

    try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            wgpuSetStatus(statusElem, prefix + " unavailable: could not acquire a GPU adapter.", "warn");
            return null;
        }

        const device = await adapter.requestDevice();
        const context = canvas.getContext("webgpu");
        if (!context) {
            wgpuSetStatus(statusElem, prefix + " init failed: canvas.getContext('webgpu') returned null.", "error");
            return null;
        }

        const format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({
            device: device,
            format: format,
            alphaMode: "opaque"
        });

        wgpuSetStatus(statusElem, prefix + " ready: adapter/device/context initialized.", "ok");
        return { adapter, device, context, format };
    } catch (error) {
        console.warn("[" + prefix + "] non-fatal init error:", error);
        wgpuSetStatus(statusElem, prefix + " init failed: " + String(error), "error");
        return null;
    }
}
